import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Observability } from './observability';

export interface ServiceStackProps extends cdk.StackProps {
	/** ECR repository holding the immutable release images. */
	repositoryName: string;
	/** Image tags to keep running in each color. */
	blueImageTag: string;
	greenImageTag: string;
	/** How many copies of each color run. */
	desiredCount?: number;
	/** Where alarm emails go. */
	alarmEmail?: string;
}

/**
 * Two independent, always-running ECS services share an ALB. Deployments update the inactive color,
 * verify its health, then switch the listener. The previous color remains warm for an immediate rollback.
 */
export class ServiceStack extends cdk.Stack {
	public readonly blueService: ecs.FargateService;
	public readonly greenService: ecs.FargateService;
	public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

	constructor(scope: Construct, id: string, props: ServiceStackProps) {
		super(scope, id, props);

		const region = cdk.Stack.of(this).region;
		const zones = cdk.Token.isUnresolved(region) ? { maxAzs: 2 } : { availabilityZones: [`${region}a`, `${region}b`] };
		const vpc = new ec2.Vpc(this, 'Vpc', {
			...zones,
			natGateways: 0,
			subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
		});
		const cluster = new ecs.Cluster(this, 'Cluster', { vpc });
		const logGroup = new logs.LogGroup(this, 'AppLogs', {
			logGroupName: '/astro-blog/app',
			retention: logs.RetentionDays.ONE_WEEK,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});
		const repository = ecr.Repository.fromRepositoryName(this, 'Repository', props.repositoryName);
		const desiredCount = props.desiredCount ?? 1;
		const makeService = (color: 'Blue' | 'Green', imageTag: string) => {
			const taskDefinition = new ecs.FargateTaskDefinition(this, `${color}TaskDefinition`, {
				cpu: 256,
				memoryLimitMiB: 512,
				runtimePlatform: {
					cpuArchitecture: ecs.CpuArchitecture.X86_64,
					operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
				},
			});
			taskDefinition.addContainer('app', {
				image: ecs.ContainerImage.fromEcrRepository(repository, imageTag),
				portMappings: [{ containerPort: 4321 }],
				logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: color.toLowerCase() }),
				environment: { LOG_LEVEL: 'INFO' },
				stopTimeout: cdk.Duration.seconds(15),
				healthCheck: {
					command: [
						'CMD',
						'node',
						'-e',
						"fetch('http://127.0.0.1:4321/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
					],
					interval: cdk.Duration.seconds(10),
					timeout: cdk.Duration.seconds(3),
					retries: 3,
					startPeriod: cdk.Duration.seconds(15),
				},
			});

			return new ecs.FargateService(this, `${color}Service`, {
				serviceName: `cs4421-astro-blog-${color.toLowerCase()}`,
				cluster,
				taskDefinition,
				desiredCount,
				assignPublicIp: true,
				vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
				minHealthyPercent: 100,
				maxHealthyPercent: 200,
				circuitBreaker: { rollback: true },
				healthCheckGracePeriod: cdk.Duration.seconds(30),
			});
		};

		this.blueService = makeService('Blue', props.blueImageTag);
		this.greenService = makeService('Green', props.greenImageTag);
		this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', { vpc, internetFacing: true });

		const targetGroupSettings: elbv2.ApplicationTargetGroupProps = {
			vpc,
			port: 4321,
			protocol: elbv2.ApplicationProtocol.HTTP,
			targetType: elbv2.TargetType.IP,
			deregistrationDelay: cdk.Duration.seconds(15),
			healthCheck: {
				path: '/api/readyz',
				interval: cdk.Duration.seconds(10),
				timeout: cdk.Duration.seconds(5),
				healthyThresholdCount: 2,
				unhealthyThresholdCount: 2,
				healthyHttpCodes: '200',
			},
		};
		const blueTargetGroup = new elbv2.ApplicationTargetGroup(this, 'BlueTargetGroup', targetGroupSettings);
		const greenTargetGroup = new elbv2.ApplicationTargetGroup(this, 'GreenTargetGroup', targetGroupSettings);
		this.blueService.attachToApplicationTargetGroup(blueTargetGroup);
		this.greenService.attachToApplicationTargetGroup(greenTargetGroup);

		const listener = this.loadBalancer.addListener('Http', {
			port: 80,
			open: true,
			defaultAction: elbv2.ListenerAction.fixedResponse(404, { contentType: 'text/plain', messageBody: 'Not found' }),
		});
		const productionRule = new elbv2.ApplicationListenerRule(this, 'ProductionRule', {
			listener,
			priority: 1,
			conditions: [elbv2.ListenerCondition.pathPatterns(['*'])],
			action: elbv2.ListenerAction.weightedForward([
				{ targetGroup: blueTargetGroup, weight: 100 },
				{ targetGroup: greenTargetGroup, weight: 0 },
			]),
		});

		new Observability(this, 'Observability', {
			logGroup,
			loadBalancer: this.loadBalancer,
			targetGroups: [blueTargetGroup, greenTargetGroup],
			services: [this.blueService, this.greenService],
			alarmEmail: props.alarmEmail,
		});

		cdk.Tags.of(this).add('Project', 'cs4421-astro-blog');
		new cdk.CfnOutput(this, 'ServiceUrl', { value: `http://${this.loadBalancer.loadBalancerDnsName}` });
		new cdk.CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
		new cdk.CfnOutput(this, 'BlueServiceName', { value: this.blueService.serviceName });
		new cdk.CfnOutput(this, 'GreenServiceName', { value: this.greenService.serviceName });
		new cdk.CfnOutput(this, 'BlueTargetGroupArn', { value: blueTargetGroup.targetGroupArn });
		new cdk.CfnOutput(this, 'GreenTargetGroupArn', { value: greenTargetGroup.targetGroupArn });
		new cdk.CfnOutput(this, 'ProductionRuleArn', { value: productionRule.listenerRuleArn });
		new cdk.CfnOutput(this, 'LogGroupName', { value: logGroup.logGroupName });
		new cdk.CfnOutput(this, 'BlueImageDeployed', { value: `${props.repositoryName}:${props.blueImageTag}` });
		new cdk.CfnOutput(this, 'GreenImageDeployed', { value: `${props.repositoryName}:${props.greenImageTag}` });
	}
}
