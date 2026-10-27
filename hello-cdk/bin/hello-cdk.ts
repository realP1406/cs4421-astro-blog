#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { RegistryStack } from '../lib/registry-stack';
import { ServiceStack } from '../lib/service-stack';
import { StaticSiteStack } from '../lib/hello-cdk-stack';

const app = new cdk.App();

// Account comes from whoever is running the command (your AWS login, or the CI credentials).
// Everything lives in us-east-1, where CDK is already set up for this account.
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };

// Settings you can pass on the command line:  npx cdk deploy AstroBlogService -c blueImageTag=v1.0.0 -c greenImageTag=abc1234
const imageTag: string = app.node.tryGetContext('imageTag') ?? 'v1.0.0';
const blueImageTag: string = app.node.tryGetContext('blueImageTag') ?? imageTag;
const greenImageTag: string = app.node.tryGetContext('greenImageTag') ?? imageTag;
const repositoryName: string = app.node.tryGetContext('repositoryName') ?? 'astro-blog';
const alarmEmail: string | undefined = app.node.tryGetContext('alarmEmail');
const budgetEmail: string | undefined = app.node.tryGetContext('budgetEmail');
const desiredCount = Number(app.node.tryGetContext('desiredCount') ?? 1);

// 1. The static website (S3 + CloudFront). Unchanged.
new StaticSiteStack(app, 'HelloCdkStack', { env });

// 2. The image registry (ECR). Deploy this first, then push an image.
new RegistryStack(app, 'AstroBlogRegistry', { env, repositoryName, budgetEmail });

// 3. The running container (ECS + load balancer + monitoring). Needs the image from step 2.
new ServiceStack(app, 'AstroBlogService', { env, repositoryName, blueImageTag, greenImageTag, desiredCount, alarmEmail });
