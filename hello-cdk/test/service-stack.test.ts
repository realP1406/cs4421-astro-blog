import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ServiceStack, type ServiceStackProps } from '../lib/service-stack';

function build(overrides: Partial<ServiceStackProps> = {}) {
	const app = new cdk.App();
	const stack = new ServiceStack(app, 'Service', {
		env: { account: '123456789012', region: 'us-east-1' },
		repositoryName: 'astro-blog',
		imageTag: 'v1.0.0',
		alarmEmail: 'ops@example.com',
		...overrides,
	});
	return Template.fromStack(stack);
}

const only = (template: Template, type: string) => Object.values(template.findResources(type))[0].Properties;

describe('network and cost guards', () => {
	const template = build();

	test('has NO NAT Gateway (about $32 a month, it would eat the credits)', () => {
		template.resourceCountIs('AWS::EC2::NatGateway', 0);
	});

	test('has no Elastic IP addresses of its own (each costs money)', () => {
		template.resourceCountIs('AWS::EC2::EIP', 0);
	});

	test('uses two availability zones, all public subnets', () => {
		template.resourceCountIs('AWS::EC2::Subnet', 2);
		const subnets = Object.values(template.findResources('AWS::EC2::Subnet'));
		for (const subnet of subnets) expect(subnet.Properties.MapPublicIpOnLaunch).toBe(true);
	});

	test('names its two zones outright, so building the stack never calls AWS', () => {
		const zones = Object.values(template.findResources('AWS::EC2::Subnet')).map((subnet) => subnet.Properties.AvailabilityZone);
		expect(zones.sort()).toEqual(['us-east-1a', 'us-east-1b']);
	});

	test('still works when the region is not known yet', () => {
		const app = new cdk.App();
		const stack = new ServiceStack(app, 'NoEnv', { repositoryName: 'astro-blog', imageTag: 'v1.0.0' });
		Template.fromStack(stack).resourceCountIs('AWS::EC2::Subnet', 2);
	});

	test('creates exactly one load balancer and one cluster', () => {
		template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
		template.resourceCountIs('AWS::ECS::Cluster', 1);
	});

	test('tags everything with the project name', () => {
		template.hasResourceProperties('AWS::ECS::Cluster', { Tags: Match.arrayWith([{ Key: 'Project', Value: 'cs4421-astro-blog' }]) });
	});
});

describe('container', () => {
	const template = build();
	const taskDefinition = only(template, 'AWS::ECS::TaskDefinition');
	const container = taskDefinition.ContainerDefinitions[0];

	test('is the smallest Fargate size (0.25 vCPU, 0.5 GB), on x86 Linux', () => {
		expect(taskDefinition).toMatchObject({ Cpu: '256', Memory: '512', NetworkMode: 'awsvpc', RequiresCompatibilities: ['FARGATE'] });
		expect(taskDefinition.RuntimePlatform).toEqual({ CpuArchitecture: 'X86_64', OperatingSystemFamily: 'LINUX' });
	});

	test('runs the astro-blog image at the requested tag', () => {
		expect(JSON.stringify(container.Image)).toContain('/astro-blog:v1.0.0');
	});

	test('never uses the "latest" tag', () => {
		expect(JSON.stringify(container.Image)).not.toContain(':latest');
	});

	test('uses whichever tag it is given', () => {
		const other = only(build({ imageTag: 'abc1234' }), 'AWS::ECS::TaskDefinition').ContainerDefinitions[0];
		expect(JSON.stringify(other.Image)).toContain('/astro-blog:abc1234');
	});

	test('listens on port 4321', () => {
		expect(container.PortMappings).toEqual([{ ContainerPort: 4321, Protocol: 'tcp' }]);
	});

	test('sends its logs to CloudWatch', () => {
		expect(container.LogConfiguration.LogDriver).toBe('awslogs');
		expect(container.LogConfiguration.Options['awslogs-stream-prefix']).toBe('app');
		expect(JSON.stringify(container.LogConfiguration.Options['awslogs-group'])).toContain('AppLogs');
	});

	test('has its own health check against /api/health', () => {
		expect(container.HealthCheck.Command.join(' ')).toContain('/api/health');
		expect(container.HealthCheck).toMatchObject({ Interval: 10, Timeout: 3, Retries: 3, StartPeriod: 15 });
	});

	test('is given time to drain after SIGTERM, longer than the app waits (5s)', () => {
		expect(container.StopTimeout).toBe(15);
	});
});

describe('service', () => {
	const template = build();
	const service = only(template, 'AWS::ECS::Service');

	test('runs one copy by default, or as many as asked', () => {
		expect(service.DesiredCount).toBe(1);
		expect(only(build({ desiredCount: 2 }), 'AWS::ECS::Service').DesiredCount).toBe(2);
	});

	test('lets both versions run side by side during a release (zero downtime)', () => {
		expect(service.DeploymentConfiguration).toMatchObject({ MinimumHealthyPercent: 100, MaximumPercent: 200 });
	});

	test('stops and goes back at once if new tasks keep failing to start (for example a missing image)', () => {
		expect(service.DeploymentConfiguration.DeploymentCircuitBreaker).toEqual({ Enable: true, Rollback: true });
	});

	test('gets a public address, since there is no NAT Gateway', () => {
		expect(service.NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp).toBe('ENABLED');
	});

	test('waits 30 seconds before judging the load balancer health check', () => {
		expect(service.HealthCheckGracePeriodSeconds).toBe(30);
	});
});

describe('load balancer', () => {
	const template = build();

	test('is internet facing and listens on port 80 (HTTPS comes in T7)', () => {
		template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', { Scheme: 'internet-facing', Type: 'application' });
		template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', { Port: 80, Protocol: 'HTTP' });
	});

	test('checks /api/readyz (readiness, not just liveness) every 10 seconds', () => {
		template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
			HealthCheckPath: '/api/readyz',
			HealthCheckIntervalSeconds: 10,
			HealthCheckTimeoutSeconds: 5,
			HealthyThresholdCount: 2,
			UnhealthyThresholdCount: 2,
			Matcher: { HttpCode: '200' },
			Port: 4321,
		});
	});

	test('stops sending traffic to a removed task after 15 seconds, not the default 300 (fast rollbacks)', () => {
		template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
			TargetGroupAttributes: Match.arrayWith([{ Key: 'deregistration_delay.timeout_seconds', Value: '15' }]),
		});
	});
});

// Finds a loop in "A needs B needs A" relationships, which CloudFormation refuses to deploy.
function findCycle(resources: Record<string, { Properties?: unknown; DependsOn?: string | string[] }>): string[] | undefined {
	const names = new Set(Object.keys(resources));
	const refsIn = (value: unknown, found: Set<string>): void => {
		if (Array.isArray(value)) return value.forEach((item) => refsIn(item, found));
		if (value && typeof value === 'object') {
			for (const [key, inner] of Object.entries(value)) {
				if (key === 'Ref' && typeof inner === 'string' && names.has(inner)) found.add(inner);
				else if (key === 'Fn::GetAtt' && Array.isArray(inner) && names.has(inner[0])) found.add(inner[0]);
				else refsIn(inner, found);
			}
		}
	};
	const edges = new Map<string, Set<string>>();
	for (const [name, resource] of Object.entries(resources)) {
		const found = new Set<string>();
		refsIn(resource.Properties, found);
		for (const dependency of [resource.DependsOn ?? []].flat()) if (names.has(dependency)) found.add(dependency);
		edges.set(name, found);
	}
	const state = new Map<string, 'visiting' | 'done'>();
	const path: string[] = [];
	const visit = (name: string): string[] | undefined => {
		if (state.get(name) === 'done') return undefined;
		if (state.get(name) === 'visiting') return [...path.slice(path.indexOf(name)), name];
		state.set(name, 'visiting');
		path.push(name);
		for (const next of edges.get(name) ?? []) {
			const cycle = visit(next);
			if (cycle) return cycle;
		}
		path.pop();
		state.set(name, 'done');
		return undefined;
	};
	for (const name of names) {
		const cycle = visit(name);
		if (cycle) return cycle;
	}
	return undefined;
}

describe('blue/green releases', () => {
	const template = build();
	const resources = template.toJSON().Resources as Record<string, { Type: string; Properties: Record<string, any>; DependsOn?: string | string[] }>;
	const service = only(template, 'AWS::ECS::Service');
	const logicalId = (type: string, contains: string) =>
		Object.entries(resources).find(([id, resource]) => resource.Type === type && id.includes(contains))![0];

	test('uses ECS native blue/green, with the old version kept for a 2 minute bake time', () => {
		expect(service.DeploymentConfiguration).toMatchObject({ Strategy: 'BLUE_GREEN', BakeTimeInMinutes: 2 });
	});

	test('rolls back by itself when the 5xx alarm fires during a release', () => {
		expect(service.DeploymentConfiguration.Alarms).toEqual({ AlarmNames: ['Bondwell-server-errors'], Enable: true, Rollback: true });
	});

	test('the service waits for that alarm to exist before it starts', () => {
		const alarmId = logicalId('AWS::CloudWatch::Alarm', 'Target5xxAlarm');
		expect([resources[logicalId('AWS::ECS::Service', 'Service')].DependsOn].flat()).toContain(alarmId);
	});

	test('has exactly two target groups, blue and green, both for IP targets', () => {
		template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 2);
		const groups = Object.entries(resources).filter(([, resource]) => resource.Type === 'AWS::ElasticLoadBalancingV2::TargetGroup');
		expect(groups.map(([id]) => id).sort()).toEqual([expect.stringContaining('Blue'), expect.stringContaining('Green')]);
		for (const [, group] of groups) expect(group.Properties.TargetType).toBe('ip');
	});

	test('blue and green are identical, and both check /api/readyz', () => {
		const groups = Object.values(resources).filter((resource) => resource.Type === 'AWS::ElasticLoadBalancingV2::TargetGroup');
		const [first, second] = groups.map(({ Properties }) => Properties);
		expect(first).toMatchObject({ HealthCheckPath: '/api/readyz', HealthCheckIntervalSeconds: 10, Port: 4321 });
		expect(second).toEqual({ ...first, ...second });
		for (const group of [first, second]) {
			expect(group.TargetGroupAttributes).toEqual(expect.arrayContaining([{ Key: 'deregistration_delay.timeout_seconds', Value: '15' }]));
		}
	});

	test('the service starts in blue and is told about green as the alternate', () => {
		const loadBalancer = service.LoadBalancers[0];
		expect(loadBalancer).toMatchObject({ ContainerName: 'app', ContainerPort: 4321 });
		expect(JSON.stringify(loadBalancer.TargetGroupArn)).toContain('BlueTargetGroup');
		expect(JSON.stringify(loadBalancer.AdvancedConfiguration.AlternateTargetGroupArn)).toContain('GreenTargetGroup');
		expect(JSON.stringify(loadBalancer.AdvancedConfiguration.ProductionListenerRule)).toContain('ProductionRule');
		expect(loadBalancer.AdvancedConfiguration.RoleArn).toBeDefined();
	});

	test('the production rule catches every request and lists BOTH groups, 100 on blue and 0 on green (an AWS requirement)', () => {
		template.resourceCountIs('AWS::ElasticLoadBalancingV2::ListenerRule', 1);
		const rule = Object.values(resources).find((resource) => resource.Type === 'AWS::ElasticLoadBalancingV2::ListenerRule')!.Properties;
		expect(rule.Priority).toBe(1);
		expect(rule.Conditions).toEqual([{ Field: 'path-pattern', PathPatternConfig: { Values: ['*'] } }]);
		const forward = rule.Actions[0].ForwardConfig.TargetGroups as Array<{ TargetGroupArn: unknown; Weight: number }>;
		expect(forward).toHaveLength(2);
		expect(forward.map((group) => group.Weight)).toEqual([100, 0]);
		expect(JSON.stringify(forward[0].TargetGroupArn)).toContain('Blue');
		expect(JSON.stringify(forward[1].TargetGroupArn)).toContain('Green');
	});

	test('anything that somehow misses the rule gets a 404, not a task', () => {
		template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
			Port: 80,
			DefaultActions: [{ Type: 'fixed-response', FixedResponseConfig: { StatusCode: '404', ContentType: 'text/plain', MessageBody: 'Not found' } }],
		});
	});

	test('ECS gets a role to move traffic between the groups, with the AWS-managed policy for it', () => {
		const role = Object.values(resources).find(
			(resource) => resource.Type === 'AWS::IAM::Role' && JSON.stringify(resource.Properties.AssumeRolePolicyDocument).includes('ecs.amazonaws.com') && JSON.stringify(resource.Properties.ManagedPolicyArns ?? []).includes('AmazonECSInfrastructureRolePolicyForLoadBalancers'),
		);
		expect(role).toBeDefined();
	});

	test('has no circular dependencies (CloudFormation would refuse to deploy it)', () => {
		expect(findCycle(resources)).toBeUndefined();
	});

	test('the cycle check really does catch a cycle', () => {
		const loop = { A: { Properties: { x: { Ref: 'B' } } }, B: { Properties: { y: { 'Fn::GetAtt': ['A', 'Arn'] } } } };
		expect(findCycle(loop)).toEqual(['A', 'B', 'A']);
	});
});

describe('security groups', () => {
	const template = build();

	test('only the load balancer is open to the internet, and only on port 80', () => {
		const groups = Object.values(template.findResources('AWS::EC2::SecurityGroup'));
		const openToWorld = groups.flatMap((group) =>
			(group.Properties.SecurityGroupIngress ?? []).filter((rule: { CidrIp?: string }) => rule.CidrIp === '0.0.0.0/0'),
		);
		expect(openToWorld).toHaveLength(1);
		expect(openToWorld[0]).toMatchObject({ FromPort: 80, ToPort: 80 });
	});

	test('the container accepts traffic on 4321 only from the load balancer', () => {
		template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
			FromPort: 4321,
			ToPort: 4321,
			IpProtocol: 'tcp',
			SourceSecurityGroupId: Match.anyValue(),
		});
		const worldOn4321 = Object.values(template.findResources('AWS::EC2::SecurityGroupIngress')).filter(
			(rule) => rule.Properties.CidrIp === '0.0.0.0/0' && rule.Properties.FromPort === 4321,
		);
		expect(worldOn4321).toHaveLength(0);
	});
});

describe('logs and monitoring', () => {
	const template = build();

	test('keeps application logs for one week in the /astro-blog/app group', () => {
		template.hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: '/astro-blog/app', RetentionInDays: 7 });
	});

	test('removes the log group when the stack is deleted, so teardown leaves nothing behind', () => {
		template.hasResource('AWS::Logs::LogGroup', { DeletionPolicy: 'Delete' });
	});

	test('includes the five alarms, the three log metrics and the dashboard', () => {
		template.resourceCountIs('AWS::CloudWatch::Alarm', 5);
		template.resourceCountIs('AWS::Logs::MetricFilter', 3);
		template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
	});

	test('emails the alarm address', () => {
		template.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'ops@example.com' });
	});
});

describe('outputs', () => {
	test('shows the address and names needed after a deploy', () => {
		const outputs = Object.keys(build().findOutputs('*'));
		for (const name of ['ServiceUrl', 'ClusterName', 'ServiceName', 'LogGroupName', 'ImageDeployed']) {
			expect(outputs).toContain(name);
		}
	});

	test('ImageDeployed says which image version is running', () => {
		expect(build({ imageTag: 'v2.0.0' }).findOutputs('ImageDeployed').ImageDeployed.Value).toBe('astro-blog:v2.0.0');
	});
});
