import { describe, expect, test } from 'vitest';
import { activeColorForWeights, forwardingAction } from './switch-traffic.mjs';

const blueArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/blue/abc';
const greenArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/green/def';

describe('traffic switch decisions', () => {
	test.each([
		[[{ TargetGroupArn: blueArn, Weight: 100 }, { TargetGroupArn: greenArn, Weight: 0 }], 'blue'],
		[[{ TargetGroupArn: blueArn, Weight: 0 }, { TargetGroupArn: greenArn, Weight: 100 }], 'green'],
	])('identifies active color from the listener weights', (groups, expected) => {
		expect(activeColorForWeights(groups, blueArn, greenArn)).toBe(expected);
	});

	test('rejects split traffic or a missing target group', () => {
		expect(() => activeColorForWeights([{ TargetGroupArn: blueArn, Weight: 50 }, { TargetGroupArn: greenArn, Weight: 50 }], blueArn, greenArn)).toThrow();
		expect(() => activeColorForWeights([{ TargetGroupArn: blueArn, Weight: 100 }], blueArn, greenArn)).toThrow();
	});

	test('builds an action that gives all traffic to blue and keeps green in the rule', () => {
		expect(forwardingAction(blueArn, greenArn, 'blue')).toEqual([
			{ Type: 'forward', ForwardConfig: { TargetGroups: [{ TargetGroupArn: blueArn, Weight: 100 }, { TargetGroupArn: greenArn, Weight: 0 }] } },
		]);
	});

	test('rejects an invalid color instead of silently choosing a target', () => {
		expect(() => forwardingAction(blueArn, greenArn, 'purple')).toThrow('Unknown color');
	});
});
