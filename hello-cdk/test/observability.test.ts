import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Observability } from '../lib/observability';

// A minimal version of the real setup (ALB in front of a Fargate service), enough to attach monitoring to.
function buildStack(alarmEmail?: string) {
	const app = new cdk.App();
	const stack = new cdk.Stack(app, 'TestStack');
	const vpc = new ec2.Vpc(stack, 'Vpc', {
		maxAzs: 2,
		natGateways: 0,
		subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
	});
	const cluster = new ecs.Cluster(stack, 'Cluster', { vpc });
	const taskDefinition = new ecs.FargateTaskDefinition(stack, 'Task', { cpu: 256, memoryLimitMiB: 512 });
	taskDefinition.addContainer('app', {
		image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:22-alpine'),
		portMappings: [{ containerPort: 4321 }],
	});
	const service = new ecs.FargateService(stack, 'Service', { cluster, taskDefinition, assignPublicIp: true });
	const loadBalancer = new elbv2.ApplicationLoadBalancer(stack, 'Alb', { vpc, internetFacing: true });
	const targetGroup = loadBalancer
		.addListener('Http', { port: 80 })
		.addTargets('App', { port: 4321, protocol: elbv2.ApplicationProtocol.HTTP, targets: [service], healthCheck: { path: '/api/readyz' } });
	const logGroup = new logs.LogGroup(stack, 'Logs', { retention: logs.RetentionDays.ONE_WEEK });

	new Observability(stack, 'Observability', { logGroup, loadBalancer, targetGroup, service, alarmEmail });
	return Template.fromStack(stack);
}

describe('notifications', () => {
	const template = buildStack('ops@example.com');

	test('creates one SNS topic', () => {
		template.resourceCountIs('AWS::SNS::Topic', 1);
	});

	test('emails the address it was given', () => {
		template.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'ops@example.com' });
	});

	test('creates no subscription when no email is given', () => {
		buildStack().resourceCountIs('AWS::SNS::Subscription', 0);
	});
});

describe('metrics made from log lines', () => {
	const template = buildStack();

	test('creates exactly three metric filters', () => {
		template.resourceCountIs('AWS::Logs::MetricFilter', 3);
	});

	test.each([
		['ErrorLogs', '{ $.level = "ERROR" }'],
		['ReadinessProblems', '{ $.message = "readiness*" }'],
		['SlowRequests', '{ $.latencyMs > 1000 }'],
	])('%s counts lines matching %s', (metricName, filterPattern) => {
		template.hasResourceProperties('AWS::Logs::MetricFilter', {
			FilterPattern: filterPattern,
			MetricTransformations: [Match.objectLike({ MetricName: metricName, MetricNamespace: 'Bondwell', MetricValue: '1', DefaultValue: 0 })],
		});
	});

	test('attaches the filters to the app log group', () => {
		template.hasResourceProperties('AWS::Logs::MetricFilter', { LogGroupName: { Ref: Match.stringLikeRegexp('^Logs') } });
	});
});

describe('alarms', () => {
	const template = buildStack('ops@example.com');

	test('creates exactly five (each alarm costs money)', () => {
		template.resourceCountIs('AWS::CloudWatch::Alarm', 5);
	});

	test('every alarm notifies the topic, both when it fires and when it recovers', () => {
		const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm'));
		expect(alarms).toHaveLength(5);
		for (const alarm of alarms) {
			expect(alarm.Properties.AlarmActions).toHaveLength(1);
			expect(alarm.Properties.OKActions).toHaveLength(1);
			expect(JSON.stringify(alarm.Properties.AlarmActions)).toContain('AlarmTopic');
		}
	});

	test('missing data never raises an alarm', () => {
		const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm'));
		for (const alarm of alarms) expect(alarm.Properties.TreatMissingData).toBe('notBreaching');
	});

	test('alarms on 5xx responses from the app', () => {
		template.hasResourceProperties('AWS::CloudWatch::Alarm', {
			MetricName: 'HTTPCode_Target_5XX_Count',
			Namespace: 'AWS/ApplicationELB',
			Threshold: 5,
			EvaluationPeriods: 1,
			Period: 300,
		});
	});

	test('alarms on unhealthy tasks for three minutes in a row', () => {
		template.hasResourceProperties('AWS::CloudWatch::Alarm', {
			MetricName: 'UnHealthyHostCount',
			Threshold: 1,
			EvaluationPeriods: 3,
			Period: 60,
		});
	});

	test('alarms on high CPU (2 of 3 periods above 80%)', () => {
		template.hasResourceProperties('AWS::CloudWatch::Alarm', {
			MetricName: 'CPUUtilization',
			Namespace: 'AWS/ECS',
			Threshold: 80,
			EvaluationPeriods: 3,
			DatapointsToAlarm: 2,
			ComparisonOperator: 'GreaterThanThreshold',
		});
	});

	test('alarms on ERROR log lines and readiness problems', () => {
		template.hasResourceProperties('AWS::CloudWatch::Alarm', { MetricName: 'ErrorLogs', Namespace: 'Bondwell', Threshold: 5 });
		template.hasResourceProperties('AWS::CloudWatch::Alarm', { MetricName: 'ReadinessProblems', Namespace: 'Bondwell', Threshold: 3 });
	});

	test('every alarm has a description saying what to check', () => {
		const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm'));
		for (const alarm of alarms) expect(String(alarm.Properties.AlarmDescription).length).toBeGreaterThan(20);
	});
});

describe('dashboard', () => {
	const template = buildStack();

	test('creates exactly one (the first three are free)', () => {
		template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
		template.hasResourceProperties('AWS::CloudWatch::Dashboard', { DashboardName: 'Bondwell-overview' });
	});

	test('shows alarm status, load balancer, task and app log metrics, and the latest errors', () => {
		const body = JSON.stringify(Object.values(template.findResources('AWS::CloudWatch::Dashboard'))[0]);
		for (const expected of ['Alarms', 'Requests and 5xx errors', 'Response time (p95)', 'Healthy and unhealthy tasks', 'Task CPU and memory', 'ErrorLogs', 'SlowRequests', 'Latest errors']) {
			expect(body).toContain(expected);
		}
		expect(body).toContain('filter level = \\\\\\"ERROR\\\\\\"');
	});
});

describe('outputs', () => {
	test('exports the topic ARN and dashboard name', () => {
		const outputs = Object.keys(buildStack().findOutputs('*'));
		expect(outputs.some((name) => name.includes('AlarmTopicArn'))).toBe(true);
		expect(outputs.some((name) => name.includes('DashboardName'))).toBe(true);
	});
});
