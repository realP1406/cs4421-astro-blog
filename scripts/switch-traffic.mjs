#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const stackName = process.env.SERVICE_STACK_NAME ?? 'AstroBlogService';
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';

function aws(...args) {
	return execFileSync('aws', [...args, '--region', region], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function stackOutputs() {
	const outputs = JSON.parse(aws('cloudformation', 'describe-stacks', '--stack-name', stackName, '--query', 'Stacks[0].Outputs', '--output', 'json'));
	return Object.fromEntries(outputs.map(({ OutputKey, OutputValue }) => [OutputKey, OutputValue]));
}

export function activeColorForWeights(groups, blueArn, greenArn) {
	if (!Array.isArray(groups) || groups.length !== 2) throw new Error('Production listener must forward to exactly two target groups.');
	const blue = groups.find((group) => group.TargetGroupArn === blueArn)?.Weight;
	const green = groups.find((group) => group.TargetGroupArn === greenArn)?.Weight;
	if (blue === 100 && green === 0) return 'blue';
	if (green === 100 && blue === 0) return 'green';
	throw new Error('Production listener weights are not a supported 100/0 blue-green configuration.');
}

export function forwardingAction(blueArn, greenArn, color) {
	if (color !== 'blue' && color !== 'green') throw new Error(`Unknown color "${color}". Choose blue or green.`);
	return [
		{
			Type: 'forward',
			ForwardConfig: {
				TargetGroups: [
					{ TargetGroupArn: blueArn, Weight: color === 'blue' ? 100 : 0 },
					{ TargetGroupArn: greenArn, Weight: color === 'green' ? 100 : 0 },
				],
			},
		},
	];
}

function run() {
	const [requestedColor, ...extra] = process.argv.slice(2);
	if (extra.length > 0 || (requestedColor && !['rollback', 'blue', 'green'].includes(requestedColor))) {
		throw new Error('Usage: npm run rollback | npm run switch:traffic -- <blue|green>');
	}

	const outputs = stackOutputs();
	const required = ['ProductionRuleArn', 'BlueTargetGroupArn', 'GreenTargetGroupArn'];
	for (const key of required) {
		if (!outputs[key]) throw new Error(`CloudFormation stack ${stackName} is missing the ${key} output; deploy the current blue/green service stack first.`);
	}
	const { ProductionRuleArn: ruleArn, BlueTargetGroupArn: blueArn, GreenTargetGroupArn: greenArn } = outputs;
	const groups = JSON.parse(aws('elbv2', 'describe-rules', '--rule-arns', ruleArn, '--query', 'Rules[0].Actions[0].ForwardConfig.TargetGroups', '--output', 'json'));
	const activeColor = activeColorForWeights(groups, blueArn, greenArn);
	const targetColor = requestedColor === 'rollback' || !requestedColor ? (activeColor === 'blue' ? 'green' : 'blue') : requestedColor;
	const targetArn = targetColor === 'blue' ? blueArn : greenArn;
	if (targetColor === activeColor) {
		console.log(`Traffic is already using ${activeColor}; no change made.`);
		return;
	}

	const health = JSON.parse(aws('elbv2', 'describe-target-health', '--target-group-arn', targetArn, '--output', 'json'));
	const healthyTargets = health.TargetHealthDescriptions.filter((item) => item.TargetHealth.State === 'healthy');
	if (healthyTargets.length === 0) throw new Error(`Refusing to switch traffic: the ${targetColor} target group has no healthy targets.`);

	const actions = JSON.stringify(forwardingAction(blueArn, greenArn, targetColor));
	aws('elbv2', 'modify-rule', '--rule-arn', ruleArn, '--actions', actions, '--output', 'json');
	console.log(`Production traffic switched from ${activeColor} to ${targetColor}. The ${activeColor} service remains running for rollback.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	try {
		run();
	} catch (error) {
		console.error(`Traffic switch failed: ${error.message}`);
		process.exitCode = 1;
	}
}
