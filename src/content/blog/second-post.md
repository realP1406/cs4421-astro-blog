---
title: 'Week 2'
description: ''
pubDate: 'Sep 20 2026'
heroImage: '../../assets/w2.png'
author: 'param-hingorani'
---


# CS4421: DevOps — Week 2

## Agile Frameworks, Collaborative Git & SCM Platforms

---

# 1. Week 2 Overview

### Block 1 — Agile & Requirements

* Agile Manifesto
* Scrum:

  * Roles
  * Ceremonies
  * Artifacts
  * Definition of Done
* Requirements Engineering
* User Stories
* Acceptance Criteria

### Block 2 — Tooling & Architecture

* Source Code Management (SCM) platforms
* GitHub vs GitLab vs Bitbucket
* Branching strategies:

  * Trunk-Based / GitHub Flow
  * GitFlow
* Pull Requests
* Code reviews
* 3-way merge conflicts
* Astro Content Collections
* Zod schema validation

### Block 3 — Practical Lab

* GitHub Project Board
* Kanban workflow
* Astro Content Collections
* Feature branches
* `npm run check`
* Merge conflict simulation
* Peer code reviews

---

# 2. Agile Manifesto

The Agile Manifesto was created in **2001**.

Agile prioritises collaboration and working outcomes over rigid processes.

### The 4 Agile Values

| Value                          | More Important Than         |
| ------------------------------ | --------------------------- |
| **Individuals & Interactions** | Processes & Tools           |
| **Working Software**           | Comprehensive Documentation |
| **Customer Collaboration**     | Contract Negotiation        |
| **Responding to Change**       | Following a Plan            |

### Important Principle

The items on the right still have value.

However, Agile places **more value on the items on the left**.

---

# 3. Scrum Framework

Scrum is an Agile framework for organising software development.

## 3 Core Scrum Roles

### Product Owner (PO)

Responsible for **what gets built**.

* Defines priorities
* Owns the Product Backlog

### Scrum Master

Facilitates the Scrum process.

* Removes team roadblocks
* Coaches the team in Agile practices

### Developers

Cross-functional engineers who:

* Design
* Build
* Test
* Ship software

---

# 4. Scrum Artifacts

There are **3 core Scrum artifacts**.

## Product Backlog

A prioritised list containing:

* Features
* Enhancements
* Fixes

It represents the work that could potentially be done.

## Sprint Backlog

A subset of the Product Backlog.

Contains the user stories that the team commits to completing during the sprint.

## Increment

A potentially shippable slice of the product.

The Increment must satisfy the **Definition of Done (DoD)**.

---

# 5. Scrum Ceremonies

There are **4 main Scrum ceremonies/events** covered in the slides.

```text
Sprint Planning
       ↓
Daily Standup
       ↓
Sprint Review
       ↓
Sprint Retrospective
       ↺
```

## 1. Sprint Planning

Determines:

* What will be worked on?
* How will the work be completed?

The team estimates work and commits to a Sprint Backlog.

## 2. Daily Standup

Short meeting, typically around **15 minutes**.

Questions:

* What did I do?
* What will I do today?
* Are there any blockers?

## 3. Sprint Review

A live demonstration of the product to stakeholders.

Focuses on what was actually built.

## 4. Sprint Retrospective

The team reflects on the development process.

Goal:

> Identify bottlenecks and determine how the team can improve.

The retrospective should be **blameless**.

---

# 6. Requirements Engineering

## User Stories

A user story expresses a requirement from the **end user's perspective**.

### Standard Format

```text
As a <type of user>,

I want <to perform some action / have some capability>,

So that <I achieve a specific benefit>.
```

### Example

```text
As a tech blog reader,

I want to see author bios and avatars at the bottom of articles,

So that I can learn about the writer and follow their work.
```

### Key Structure

```text
WHO?
  ↓
As a <user>

WHAT?
  ↓
I want <capability>

WHY?
  ↓
So that <benefit>
```

---

# 7. Acceptance Criteria

Acceptance Criteria (**AC**) define the conditions that must be satisfied for a user story to be considered complete.

The slides use the **Given → When → Then** format.

## Given

Describes the initial condition.

## When

Describes the action/event.

## Then

Describes the expected result.

### Example

```text
Scenario: Displaying author profile

Given an author profile exists in "src/content/authors/"

When a user visits a blog post authored by that person

Then the bottom of the article must render:
- The author's avatar
- The author's bio
- Social links

And the image must have appropriate alt text.
```

---

# 8. Definition of Done

The **Definition of Done (DoD)** is a checklist of requirements that must be satisfied before work is considered complete.

Example:

```text
[ ] Code authored on feature branch
[ ] Component tests pass locally
[ ] Peer code review approved by a teammate
[ ] Merged cleanly into main
```

### Important Distinction

**Acceptance Criteria** = What the feature must do.

**Definition of Done** = What must be completed for the work to be considered finished.

---

# 9. Source Code Management (SCM) Platforms

SCM platforms provide infrastructure around Git repositories and software development.

## GitHub

### Strengths

* Developer ecosystem
* Open source
* GitHub Actions

### Typical Use

* Modern development teams
* Open-source projects

### CI/CD

* GitHub Actions

---

## GitLab

### Strengths

* All-in-one DevOps lifecycle
* Self-hosting

### Typical Use

* Enterprises requiring on-premise isolation

### CI/CD

* GitLab CI/CD

---

## Bitbucket

### Strengths

* Strong integration with Jira and Confluence

### Typical Use

* Atlassian enterprise ecosystems

### CI/CD

* Bitbucket Pipelines

---

## Gitea / Forgejo

### Strengths

* Lightweight
* Self-hosted
* Written in Go

### Typical Use

* Small teams
* Air-gapped homelabs

### CI/CD

* External webhooks / Act Runner

---

# 10. Branching Strategies

Two major strategies discussed:

* GitHub Flow / Trunk-Based
* GitFlow

---

# 11. GitHub Flow / Trunk-Based Development

GitHub Flow is designed to be:

* Simple
* Fast
* Suitable for modern cloud development

### Structure

There is only **one long-lived branch**:

```text
main
```

Developers create short-lived feature branches:

```text
feat/bio
```

These branches are merged into `main` through **Pull Requests**.

### Example

```text
main
●──────────────●──────────────●
 \            /
  ●──●──●────
     feature
```

### Key Characteristics

* `main` remains deployable
* Feature branches are short-lived
* Changes go through Pull Requests
* Suitable for Continuous Deployment

---

# 12. GitFlow

GitFlow uses a more complex branch hierarchy.

Common branches include:

```text
master
develop
release/*
hotfix/*
```

### Typical Flow

```text
feature
   ↓
develop
   ↓
release/*
   ↓
master
```

### Intended Use

The slides associate GitFlow with:

* Boxed software
* Quarterly release cycles

### GitHub Flow vs GitFlow

| GitHub Flow                  | GitFlow                      |
| ---------------------------- | ---------------------------- |
| Simple                       | More complex                 |
| One long-lived `main`        | Multiple long-lived branches |
| Short-lived feature branches | Larger branch hierarchy      |
| Fast releases                | Release-based workflow       |
| Continuous deployment        | Scheduled releases           |

---

# 13. Pull Requests

A **Pull Request (PR)** is more than a button for merging code.

It acts as an **engineering quality gate and audit trail**.

A PR allows a team to:

* Review changes
* Discuss implementation
* Check requirements
* Identify bugs
* Verify quality
* Decide whether changes should be merged

### Example PR Structure

```markdown
## Description

Implements author bio card component as specified
in User Story #12.

## Changes

- Created `src/components/authors/alex.md`
- Added author schema validation
- Added responsive styling for mobile viewports

## Closes

Fixes #12
```

---

# 14. Code Review

Code reviews protect production quality while supporting a **blameless learning culture**.

## What Reviewers Look For

### Correctness

* Does the code work?
* Are edge cases handled?

Example:

> What happens if an author has no avatar?

### Readability

* Is the code easy to understand?
* Are names clear?
* Are conventions followed?

### Security

Check for:

* Hardcoded secrets
* API keys
* Other sensitive information

### Performance & Accessibility

Check for issues such as:

* Missing `alt` attributes
* Heavy imports
* Poor performance

---

# 15. Constructive Code Review

Code reviews should be constructive rather than personal.

### Avoid

```text
"This code is messy."
```

### Prefer

```text
"Could we extract this logic into a helper function?"
```

The focus should be on **improving the code**, not criticising the developer.

---

# 16. Merge Conflicts

A merge conflict occurs when two branches modify the **same line of the same file in different ways**, and Git cannot automatically determine which version should be used.

### Example

```text
<<<<<<< HEAD

<p class="author-title">
Senior Technical Writer
</p>

=======

<p class="author-title">
Principal Cloud Architect
</p>

>>>>>>> feat/author-update
```

Git is effectively saying:

> "I have two different versions of this section. You need to decide what the final version should be."

---

# 17. Resolving a Merge Conflict

### Step 1 — Open the conflicted file

Use VS Code or another editor.

### Step 2 — Find the conflict markers

```text
<<<<<<<
=======
>>>>>>>
```

### Step 3 — Decide what the final code should be

You can:

* Keep the current version
* Keep the incoming version
* Combine both
* Rewrite the section

### Step 4 — Remove the conflict markers

Delete:

```text
<<<<<<<
=======
>>>>>>>
```

### Step 5 — Stage the resolved file

```bash
git add <file>
```

### Step 6 — Complete the merge

```bash
git commit
```

---

# 18. Astro Content Collections

Astro provides **type-safe Content Collections**.

They use **Zod** for schema validation.

The schema is defined in:

```text
src/content.config.ts
```

### Example

```javascript
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    author: z.string(),
  }),
});
```

---

# 19. Zod Schema Validation

Zod allows you to define what data your content must contain.

For example:

```javascript
title: z.string()
```

means:

> `title` must be a string.

```javascript
pubDate: z.date()
```

means:

> `pubDate` must be a date.

```javascript
author: z.string()
```

means:

> `author` must be a string.

### Optional Tags Example

```javascript
tags: z.array(z.string()).default([])
```

This defines `tags` as an array of strings with an empty array as the default.

---

# 20. `npm run check`

Run:

```bash
npm run check
```

This runs `astro check` under the hood.

It:

* Parses Markdown/MDX files
* Checks TypeScript types
* Validates frontmatter
* Checks content against Zod schemas

### Why Run It?

It catches problems **locally before they reach Git commits or Pull Requests**.

This is an example of **shift-left** engineering:

```text
Find errors earlier
       ↓
Fix errors earlier
       ↓
Less expensive problems later
```

---

# 21. GitHub Project Board

The Week 2 practical uses a Kanban board with:

```text
Backlog
   ↓
To Do
   ↓
In Progress
   ↓
Review
   ↓
Done
```

The lab requires:

* Creating the project board
* Adding active issues
* Creating user stories
* Adding acceptance criteria

---

# 22. Week 2 Practical Lab

## Objective 1 — GitHub Project Board

Create a Kanban board containing:

```text
Backlog
To Do
In Progress
Review
Done
```

Create **2 GitHub Issues** containing:

* User Story
* Acceptance Criteria

---

## Objective 2 — Astro Content Collections

Define schemas in:

```text
src/content.config.ts
```

Using Zod:

```javascript
z.object({
    title,
    author,
    pubDate
})
```

Then:

* Create author profiles
* Create a new blog post
* Use Markdown/MDX
* Run `npm run check`

Goal:

```text
0 schema errors
0 type errors
```

---

## Objective 3 — Collaborative PR & Conflict Simulation

Practice:

1. Create feature branches
2. Make changes
3. Open a Pull Request
4. Exchange code reviews
5. Deliberately create a merge conflict
6. Resolve the conflict
7. Protect the `main` branch

---

# 23. Week 2 Git Workflow

### Update `main`

```bash
git checkout main
git pull origin main
```

### Create a Feature Branch

```bash
git checkout -b feat/add-author-schema
```

### Make Changes

Modify:

```text
src/content.config.ts
```

and add your content under:

```text
src/content/
```

### Validate

```bash
npm run check
```

### Stage Changes

```bash
git add .
```

### Commit

```bash
git commit -m "feat(content): add author metadata schema validation"
```

### Push Feature Branch

```bash
git push -u origin feat/add-author-schema
```

### Create Pull Request

Open GitHub and create a Pull Request.

Link it to the relevant GitHub Issue.

---

# 24. Week 2 Deliverables

* [ ] GitHub Project Board populated with active issues
* [ ] Astro Content Collections schema defined using Zod
* [ ] Schema located in `src/content.config.ts`
* [ ] `npm run check` runs locally with zero errors
* [ ] At least 1 closed Pull Request
* [ ] PR contains evidence of structured peer code review
* [ ] `main` has Branch Protection Rules
* [ ] PR approval is required before merging

---

# 25. Key Concepts to Know

For the next quiz, understand the differences between:

### Agile vs Scrum

* **Agile** = set of values/principles
* **Scrum** = framework for applying Agile principles

### User Story vs Acceptance Criteria

* **User Story** = describes the user's requirement
* **Acceptance Criteria** = defines what must be true for the requirement to be accepted

### Acceptance Criteria vs Definition of Done

* **AC** = feature-specific conditions
* **DoD** = overall completion requirements

### GitHub Flow vs GitFlow

* **GitHub Flow** = simple, short-lived feature branches + `main`
* **GitFlow** = complex release-oriented branch hierarchy

### Pull Request vs Merge

* **Pull Request** = review/discussion/quality gate
* **Merge** = combines changes into another branch

### Content Collection vs Zod

* **Content Collection** = structured Astro content
* **Zod** = validates the content's schema

### `npm run check`

```text
Markdown/MDX
     ↓
Astro Check
     ↓
TypeScript + Zod validation
     ↓
Errors / Valid Content
```

---

# 26. Week 3 Quiz Coverage

The next quiz covers:

* Scrum frameworks
* User Stories
* GitHub Flow
* SCM platform comparison
* Merge Conflicts

The quiz takes place during the **first 15 minutes of Week 3 Block 1** and uses a **locked single tab**.
