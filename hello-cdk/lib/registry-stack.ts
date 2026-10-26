import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface RegistryStackProps extends cdk.StackProps {
	/** Name of the ECR repository. The Week 6 lab uses "astro-blog". */
	repositoryName?: string;
	/** If set, an AWS Budgets alert is created that emails this address. */
	budgetEmail?: string;
	/** Monthly budget in USD. */
	budgetUsd?: number;
}

/**
 * The image registry (plus an optional cost alert). It is its own stack on purpose: the service
 * needs an image to exist before it can start, and destroying the service must never delete images.
 *
 * Already created the repository by hand in the lab? Then skip this stack. The service stack finds
 * the repository by name, so it works either way.
 */
export class RegistryStack extends cdk.Stack {
	public readonly repository: ecr.Repository;

	constructor(scope: Construct, id: string, props: RegistryStackProps = {}) {
		super(scope, id, props);

		this.repository = new ecr.Repository(this, 'Repository', {
			repositoryName: props.repositoryName ?? 'astro-blog',
			imageScanOnPush: true,
			// Images outlive this stack. Delete the repository by hand when you are completely done.
			removalPolicy: cdk.RemovalPolicy.RETAIN,
			lifecycleRules: [
				{
					description: 'Keep only the 10 most recent images (an image is about 240 MB)',
					tagStatus: ecr.TagStatus.ANY,
					maxImageCount: 10,
				},
			],
		});

		if (props.budgetEmail) {
			const limit = props.budgetUsd ?? 20;
			new budgets.CfnBudget(this, 'MonthlyBudget', {
				budget: {
					budgetName: 'astro-blog-monthly',
					budgetType: 'COST',
					timeUnit: 'MONTHLY',
					budgetLimit: { amount: limit, unit: 'USD' },
				},
				notificationsWithSubscribers: [
					{
						notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 80, thresholdType: 'PERCENTAGE' },
						subscribers: [{ subscriptionType: 'EMAIL', address: props.budgetEmail }],
					},
					{
						notification: { notificationType: 'FORECASTED', comparisonOperator: 'GREATER_THAN', threshold: 100, thresholdType: 'PERCENTAGE' },
						subscribers: [{ subscriptionType: 'EMAIL', address: props.budgetEmail }],
					},
				],
			});
		}

		new cdk.CfnOutput(this, 'RepositoryUri', { value: this.repository.repositoryUri });
	}
}
