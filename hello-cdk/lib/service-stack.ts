import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Observability } from './observability';

export interface ServiceStackProps extends cdk.StackProps {
	/** ECR repository holding the image (found by name, so it can be created by hand or by RegistryStack). */
	repositoryName: string;
	/** Which image to run, e.g. "v1.0.0" or a commit SHA. There is deliberately no default: never deploy "latest". */
	imageTag: string;
	/** How many copies of the app run. 1 keeps cost down; 2 survives a task failing with no gap. */
	desiredCount?: number;
	/** Where alarm emails go. */
	alarmEmail?: string;
}

/**
 * The running app: a small Fargate service behind an Application Load Balancer.
 *
 *   Internet -> ALB (port 80) -> Fargate task (port 4321) -> logs in CloudWatch
 *
 * Cost choices: public subnets only and NO NAT Gateway (about $32 a month), one small task,
 * one ALB, logs kept for a week. See docs/aws-design.md.
 */
export class ServiceStack extends cdk.Stack {
	public readonly service: ecs.FargateService;
	public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

	constructor(scope: Construct, id: string, props: ServiceStackProps) {
		super(scope, id, props);

		// --- Network: two zones, public subnets only ---------------------------------------
		// Zones are named outright (a and b exist in every account) so building this stack never has to
		// call AWS to look them up. That keeps `cdk synth` offline and the static-site deploy independent of it.
		const region = cdk.Stack.of(this).region;
		const zones = cdk.Token.isUnresolved(region) ? { maxAzs: 2 } : { availabilityZones: [`${region}a`, `${region}b`] };

		const vpc = new ec2.Vpc(this, 'Vpc', {
			...zones,
			natGateways: 0,
			subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
		});

		const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

		// --- Logs: one group, one week ------------------------------------------------------
		const logGroup = new logs.LogGroup(this, 'AppLogs', {
			logGroupName: '/astro-blog/app',
			retention: logs.RetentionDays.ONE_WEEK,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		// --- The container ------------------------------------------------------------------
		const repository = ecr.Repository.fromRepositoryName(this, 'Repository', props.repositoryName);

		const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
			cpu: 256,
			memoryLimitMiB: 512,
			// The image is built for x86 (see the Dockerfile and the CI runner).
			runtimePlatform: {
				cpuArchitecture: ecs.CpuArchitecture.X86_64,
				operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
			},
		});

		taskDefinition.addContainer('app', {
			image: ecs.ContainerImage.fromEcrRepository(repository, props.imageTag),
			portMappings: [{ containerPort: 4321 }],
			logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: 'app' }),
			environment: { LOG_LEVEL: 'INFO' },
			// The app drains for 5 seconds after SIGTERM, then exits. Give it a little longer than that.
			stopTimeout: cdk.Duration.seconds(15),
			// ECS ignores the Dockerfile HEALTHCHECK, so the same check is repeated here (liveness only).
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

		// --- The service: rolling deploys with automatic rollback ----------------------------
		this.service = new ecs.FargateService(this, 'Service', {
			cluster,
			taskDefinition,
			desiredCount: props.desiredCount ?? 1,
			// No NAT Gateway, so the task needs its own public address to pull from ECR and write logs.
			// Its security group still only accepts traffic from the load balancer.
			assignPublicIp: true,
			vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
			// A new version starts and must pass health checks BEFORE the old one stops (zero downtime).
			minHealthyPercent: 100,
			maxHealthyPercent: 200,
			// If the new version never becomes healthy, ECS stops the rollout and returns to the old one by itself.
			circuitBreaker: { rollback: true },
			healthCheckGracePeriod: cdk.Duration.seconds(30),
		});

		// --- Load balancer: port 80 for now (HTTPS comes in T7) -------------------------------
		this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', { vpc, internetFacing: true });
		const listener = this.loadBalancer.addListener('Http', { port: 80, open: true });

		const targetGroup = listener.addTargets('App', {
			port: 4321,
			protocol: elbv2.ApplicationProtocol.HTTP,
			targets: [this.service],
			// Short on purpose: the default (300s) would make every deploy and rollback wait 5 minutes.
			deregistrationDelay: cdk.Duration.seconds(15),
			healthCheck: {
				// Readiness, not liveness: a task that says "not ready" (starting, draining, bad config) gets no traffic.
				path: '/api/readyz',
				interval: cdk.Duration.seconds(10),
				timeout: cdk.Duration.seconds(5),
				healthyThresholdCount: 2,
				unhealthyThresholdCount: 2,
				healthyHttpCodes: '200',
			},
		});

		// --- Monitoring (built in T8) -------------------------------------------------------
		new Observability(this, 'Observability', {
			logGroup,
			loadBalancer: this.loadBalancer,
			targetGroup,
			service: this.service,
			alarmEmail: props.alarmEmail,
		});

		cdk.Tags.of(this).add('Project', 'cs4421-astro-blog');

		// --- What to look at after deploying ------------------------------------------------
		new cdk.CfnOutput(this, 'ServiceUrl', { value: `http://${this.loadBalancer.loadBalancerDnsName}` });
		new cdk.CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
		new cdk.CfnOutput(this, 'ServiceName', { value: this.service.serviceName });
		new cdk.CfnOutput(this, 'LogGroupName', { value: logGroup.logGroupName });
		new cdk.CfnOutput(this, 'ImageDeployed', { value: `${props.repositoryName}:${props.imageTag}` });
	}
}
