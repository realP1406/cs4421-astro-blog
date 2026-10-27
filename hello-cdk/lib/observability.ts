import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface ObservabilityProps {
	/** Log group the container writes its JSON log lines to. */
	logGroup: logs.ILogGroup;
	loadBalancer: elbv2.IApplicationLoadBalancer;
	/**
	 * Every target group the service can send traffic to. With blue/green deployments that is two (blue and
	 * green) and the live one swaps on each release, so health must be watched on all of them.
	 */
	targetGroups: elbv2.IApplicationTargetGroup[];
	service: ecs.FargateService;
	/** Where alarm emails go. Leave out to create the topic without a subscriber. */
	alarmEmail?: string;
	/** Namespace for the metrics made from log lines. */
	namespace?: string;
}

/**
 * Everything needed to see and be told about problems: metrics made from the app's JSON logs,
 * five alarms that email you, and one dashboard. Kept small on purpose to stay inside the budget
 * (about $0.10 per alarm per month; the first three dashboards are free).
 */
export class Observability extends Construct {
	public readonly topic: sns.Topic;
	public readonly alarms: cloudwatch.Alarm[];
	/** Fires on a burst of 5xx errors. ECS watches it during a deployment and rolls back if it fires. */
	public readonly serverErrorsAlarm: cloudwatch.Alarm;
	/** The same alarm's name as plain text (not a CloudFormation reference), safe to hand to the ECS service. */
	public readonly serverErrorsAlarmName: string;
	public readonly dashboard: cloudwatch.Dashboard;

	constructor(scope: Construct, id: string, props: ObservabilityProps) {
		super(scope, id);

		const namespace = props.namespace ?? 'Bondwell';
		this.serverErrorsAlarmName = `${namespace}-server-errors`;
		const fiveMinutes = cdk.Duration.minutes(5);

		// --- Notifications -----------------------------------------------------------------
		this.topic = new sns.Topic(this, 'AlarmTopic', { displayName: 'Bondwell alarms' });
		if (props.alarmEmail) {
			this.topic.addSubscription(new subscriptions.EmailSubscription(props.alarmEmail));
		}

		// --- Metrics made from log lines (the app logs one JSON object per line) ------------
		const logMetric = (metricName: string) =>
			new cloudwatch.Metric({ namespace, metricName, statistic: 'Sum', period: fiveMinutes });

		props.logGroup.addMetricFilter('ErrorLogsFilter', {
			filterPattern: logs.FilterPattern.stringValue('$.level', '=', 'ERROR'),
			metricNamespace: namespace,
			metricName: 'ErrorLogs',
			metricValue: '1',
			defaultValue: 0,
		});
		props.logGroup.addMetricFilter('ReadinessProblemsFilter', {
			// Matches "readiness degraded" and "readiness not_ready" (logged by /api/readyz).
			filterPattern: logs.FilterPattern.stringValue('$.message', '=', 'readiness*'),
			metricNamespace: namespace,
			metricName: 'ReadinessProblems',
			metricValue: '1',
			defaultValue: 0,
		});
		props.logGroup.addMetricFilter('SlowRequestsFilter', {
			filterPattern: logs.FilterPattern.numberValue('$.latencyMs', '>', 1000),
			metricNamespace: namespace,
			metricName: 'SlowRequests',
			metricValue: '1',
			defaultValue: 0,
		});

		// --- Alarms (five) -----------------------------------------------------------------
		// Checked every minute (not every five) so a bad release is caught while it can still be rolled back.
		const oneMinute = cdk.Duration.minutes(1);
		const target5xx = props.loadBalancer.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
			period: oneMinute,
			statistic: 'Sum',
		});
		if (props.targetGroups.length === 0) throw new Error('Observability needs at least one target group');
		const unhealthyPerGroup = props.targetGroups.map((group) => group.metrics.unhealthyHostCount({ period: oneMinute, statistic: 'Maximum' }));
		const healthyPerGroup = props.targetGroups.map((group) => group.metrics.healthyHostCount({ period: oneMinute, statistic: 'Minimum' }));
		// One alarm for all groups: the worst (highest) unhealthy count in any of them.
		const unhealthyHosts: cloudwatch.IMetric =
			unhealthyPerGroup.length === 1
				? unhealthyPerGroup[0]
				: new cloudwatch.MathExpression({
						expression: `MAX([${unhealthyPerGroup.map((_, index) => `u${index}`).join(',')}])`,
						usingMetrics: Object.fromEntries(unhealthyPerGroup.map((metric, index) => [`u${index}`, metric])),
						period: oneMinute,
						label: 'Unhealthy tasks (any target group)',
					});
		const cpu = props.service.metricCpuUtilization({ period: fiveMinutes });
		const errorLogs = logMetric('ErrorLogs');
		const readinessProblems = logMetric('ReadinessProblems');

		// No data means nothing is wrong (a quiet site logs no errors), so missing data never raises an alarm.
		this.alarms = [
			new cloudwatch.Alarm(this, 'Target5xxAlarm', {
				alarmName: this.serverErrorsAlarmName,
				alarmDescription: 'The app returned 5 or more 5xx responses within one minute. Also used to roll back a bad release. Check the log group for level=ERROR.',
				metric: target5xx,
				threshold: 5,
				evaluationPeriods: 1,
				comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
				treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
			}),
			new cloudwatch.Alarm(this, 'UnhealthyHostsAlarm', {
				alarmName: `${namespace}-unhealthy-hosts`,
				alarmDescription: 'The load balancer sees an unhealthy task (its /api/readyz check is failing) for 3 minutes.',
				metric: unhealthyHosts,
				threshold: 1,
				evaluationPeriods: 3,
				comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
				treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
			}),
			new cloudwatch.Alarm(this, 'HighCpuAlarm', {
				alarmName: `${namespace}-high-cpu`,
				alarmDescription: 'Task CPU above 80% in 2 of the last 3 five-minute periods.',
				metric: cpu,
				threshold: 80,
				evaluationPeriods: 3,
				datapointsToAlarm: 2,
				comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
				treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
			}),
			new cloudwatch.Alarm(this, 'ErrorLogsAlarm', {
				alarmName: `${namespace}-error-logs`,
				alarmDescription: '5 or more ERROR log lines in 5 minutes (crashed requests, failed requests).',
				metric: errorLogs,
				threshold: 5,
				evaluationPeriods: 1,
				comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
				treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
			}),
			new cloudwatch.Alarm(this, 'ReadinessProblemsAlarm', {
				alarmName: `${namespace}-readiness-problems`,
				alarmDescription: 'Readiness reported degraded or not_ready 3 or more times in 5 minutes (often Supabase trouble).',
				metric: readinessProblems,
				threshold: 3,
				evaluationPeriods: 1,
				comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
				treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
			}),
		];

		this.serverErrorsAlarm = this.alarms[0];

		for (const alarm of this.alarms) {
			const action = new cloudwatchActions.SnsAction(this.topic);
			alarm.addAlarmAction(action);
			alarm.addOkAction(action);
		}

		// --- Dashboard ---------------------------------------------------------------------
		this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
			dashboardName: `${namespace}-overview`,
			defaultInterval: cdk.Duration.hours(3),
		});
		this.dashboard.addWidgets(
			new cloudwatch.AlarmStatusWidget({ title: 'Alarms', alarms: this.alarms, width: 24, height: 3 }),
		);
		this.dashboard.addWidgets(
			new cloudwatch.GraphWidget({
				title: 'Requests and 5xx errors',
				left: [props.loadBalancer.metrics.requestCount({ period: fiveMinutes, statistic: 'Sum' })],
				right: [target5xx],
				width: 12,
			}),
			new cloudwatch.GraphWidget({
				title: 'Response time (p95)',
				left: [props.loadBalancer.metrics.targetResponseTime({ period: fiveMinutes, statistic: 'p95' })],
				width: 12,
			}),
		);
		this.dashboard.addWidgets(
			new cloudwatch.GraphWidget({
				title: 'Healthy and unhealthy tasks (each target group)',
				left: [...healthyPerGroup, ...unhealthyPerGroup],
				width: 12,
			}),
			new cloudwatch.GraphWidget({
				title: 'Task CPU and memory (%)',
				left: [cpu, props.service.metricMemoryUtilization({ period: fiveMinutes })],
				width: 12,
			}),
		);
		this.dashboard.addWidgets(
			new cloudwatch.GraphWidget({
				title: 'From the app logs: errors, readiness problems, slow requests (>1s)',
				left: [errorLogs, readinessProblems, logMetric('SlowRequests')],
				width: 24,
			}),
		);
		this.dashboard.addWidgets(
			new cloudwatch.LogQueryWidget({
				title: 'Latest errors',
				logGroupNames: [props.logGroup.logGroupName],
				queryLines: [
					'fields @timestamp, requestId, route, statusCode, message, error',
					'filter level = "ERROR"',
					'sort @timestamp desc',
					'limit 20',
				],
				width: 24,
				height: 6,
			}),
		);

		new cdk.CfnOutput(this, 'AlarmTopicArn', { value: this.topic.topicArn });
		new cdk.CfnOutput(this, 'DashboardName', { value: this.dashboard.dashboardName });
	}
}
