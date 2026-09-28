---
title: 'First week'
description: 'Lorem ipsum dolor sit amet'
pubDate: 'Sep 20 2026'
heroImage: '../../assets/w1.png'
author: 'param-hingorani'
---
# CS4421: DevOps — Week 1

## 1. What is "Production"?

### Classroom Software

* Runs on your laptop (`localhost`)
* Usually tested by one person
* Submitted once and graded
* Can restart easily if it crashes

### Production Software

* Runs 24/7 on remote cloud servers
* Serves thousands of concurrent users
* Has zero tolerance for silent crashes
* Must be:

  * Monitored
  * Patched
  * Secured

> **Core insight:** Software is not a static artifact; it is an evolving, living service.

---

# 2. The 6 Core SDLC Phases

**SDLC = Software Development Life Cycle**

1. **Requirements**

   * Define the problem
   * Identify user personas
   * Define functional and non-functional scope

2. **Design**

   * High-level architecture
   * Data models
   * Schemas
   * API contracts

3. **Implementation**

   * Write modular code
   * Make code testable
   * Keep code maintainable

4. **Testing (QA)**

   * Automated verification
   * Unit testing
   * Integration testing
   * Regression testing
   * Security testing

5. **Deployment**

   * Package immutable build artifacts
   * Release the software to the cloud

6. **Maintenance & Operations**

   * Monitor performance
   * Monitor logs
   * Respond to incidents
   * Scale the system

### SDLC Flow

```text
Requirements
     ↓
   Design
     ↓
Implementation
     ↓
 Testing (QA)
     ↓
 Deployment
     ↓
Maintenance & Operations
```

---

# 3. Software Development Methodologies

## Waterfall

**Philosophy:** Sequential, phase-gated and predictive.

**Best suited for:**

* Regulated hardware
* Medical systems
* Defence

**Trade-off:**

* Inflexible to change
* Feedback arrives late

---

## Agile

**Philosophy:** Iterative, collaborative and adaptive.

**Best suited for:**

* Modern web products
* Cloud products

**Trade-off:**

* Requires strong team communication

---

## Scrum

**Philosophy:**

* Time-boxed 1–2 week sprints
* Defined roles

**Best suited for:**

* Product teams building feature sets

**Trade-off:**

* Can feel rigid when there are many ceremonies

---

## Kanban

**Philosophy:**

* Continuous flow
* Work In Progress (**WIP**) limits

**Best suited for:**

* DevOps teams
* Maintenance teams
* Support teams

**Trade-off:**

* Long-term deadlines are less predictable

---

## Extreme Programming (XP)

**Key practices:**

* Pair programming
* Test-Driven Development (**TDD**)
* Continuous refactoring

**Best suited for:**

* Mission-critical software quality

**Trade-off:**

* High cognitive intensity for developers

---

## Lean Software

**Philosophy:**

* Eliminate waste
* Amplify learning
* Deliver quickly

**Best suited for:**

* High-growth startups
* MVP exploration

**Trade-off:**

* Requires a mature engineering culture

---

# 4. The "Wall of Confusion"

Before DevOps, organisations often separated:

### Development (Dev)

Focus:

* Writing new features
* Delivering features quickly

### Operations (Ops)

Focus:

* Keeping servers stable
* Preventing downtime

This created a **"Wall of Confusion"** between the two teams.

Developers would throw unverified code over the wall, while Operations had to deal with deploying and running it.

Classic problem:

> "It worked on my machine!"

---

# 5. DevOps

## Definition

DevOps is **not**:

* A tool
* A script
* A single job title

DevOps is a:

* Cultural movement
* Mindset
* Set of engineering practices

It unites **Development and Operations** into a continuous feedback loop.

### DevOps Lifecycle

```text
PLAN → CODE → BUILD → TEST
 ↑                     ↓
MONITOR ← OPERATE ← DEPLOY ← RELEASE
```

### Main Goal

Increase **software delivery velocity** while improving:

* Stability
* Security
* Quality

---

# 6. CALMS Framework

**CALMS** is a framework for understanding DevOps.

| Pillar              | Core Principle                           | Practical Meaning                            |
| ------------------- | ---------------------------------------- | -------------------------------------------- |
| **C — Culture**     | Shared ownership & blameless teamwork    | Pair code reviews, blameless post-mortems    |
| **A — Automation**  | Eliminate error-prone manual tasks       | GitHub Actions for automated testing/builds  |
| **L — Lean**        | Small batches & rapid feedback           | Short-lived feature branches, fast PRs       |
| **M — Measurement** | Visibility into health & performance     | Response latency, HTTP 5xx rates, CloudWatch |
| **S — Sharing**     | Open communication & transparent records | ADRs, Kanban                                 |

---

# 7. Course Project Roadmap

### Weeks 1–3

* Scaffold Astro blog
* Git flow
* Vitest
* Continuous Integration (**CI**)

### Week 4

* Declarative Infrastructure as Code (**IaC**)
* AWS S3
* CloudFront CDN

### Week 5

* Shift to dynamic SSR
* ADR-001

### Week 6

* Multi-stage Dockerfiles
* Amazon ECR

### Week 7

* Automated Continuous Deployment (**CD**) to AWS App Runner
* Site Reliability Engineering (**SRE**)

### Week 8

* Quiz 7
* 1-on-1 Live Defense Drill
* Worth 20%

### Overall Architecture

```text
Local Astro App
      ↓
S3 + CloudFront
      ↓
Docker Container
      ↓
App Runner
```

---

# 8. Version Control

## Centralized vs Distributed Version Control

### Centralized — SVN

* One central server stores the history
* Developers generally need to be online to:

  * Commit
  * View logs
  * Branch
* Central server is a single point of failure

### Distributed — Git

* Every clone contains the complete repository history
* Commits can happen locally and offline
* Diffs and branches can happen locally
* Uses cryptographic SHA hashes

---

# 9. Git 3-Tree Mental Model

Git tracks files across **three local states**:

```text
WORKING DIRECTORY
       │
       │ git add
       ↓
STAGING AREA
       │
       │ git commit
       ↓
GIT REPOSITORY
```

### Working Directory

The actual files on your disk.

### Staging Area / Index

The changes selected to be included in the next commit.

### Git Repository

The history stored inside `.git`.

### Important Commands

| Command                     | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `git init`                  | Creates a new `.git` repository                      |
| `git status`                | Shows the state of the working tree and staging area |
| `git add <file>`            | Moves changes into the staging area                  |
| `git commit -m "<msg>"`     | Records the staged snapshot                          |
| `git log --graph --oneline` | Visualises the Git DAG                               |
| `git diff`                  | Shows unstaged modifications                         |

---

# 10. Conventional Commits

Avoid vague commit messages such as:

```text
fix
stuff
wip
```

Instead use:

```text
<type>(<optional scope>): <short description>
```

The description should be in the **imperative mood**.

### Common Types

```text
feat: add author bio component to blog post

fix: correct 404 routing error on tag page

docs: update deployment steps in README

test: add unit test for date formatter

chore: upgrade Astro dependencies

ci: configure GitHub Actions workflow
```

---

# 11. Astro Project Structure

Important directories/files:

```text
src/
├── pages/       → File-based routing
├── components/  → Reusable UI components
└── layouts/     → Page layouts

astro.config.mjs → Framework configuration
```

---

# 12. Week 1 Practical Lab

## Objectives

1. Verify the local Node.js installation:

```bash
node -v
```

2. Generate an SSH key:

```bash
ssh-keygen -t ed25519
```

3. Link the SSH key to GitHub.

4. Create an Astro blog:

```bash
npm create astro@latest
```

5. Explore the Astro project structure.

6. Initialise Git.

7. Configure `.gitignore`.

8. Create conventional commits.

9. Publish the project to GitHub.

---

# 13. Astro + Git Setup Commands

### Create the Astro Blog

```bash
npm create astro@latest my-astro-blog -- --template blog --no-install --no-git
```

### Enter the Project

```bash
cd my-astro-blog
```

### Install Dependencies

```bash
npm install
```

### Initialise Git

```bash
git init
```

### Stage Files

```bash
git add .
```

### Initial Commit

```bash
git commit -m "feat: initial scaffold of Astro blog platform"
```

### Rename Branch to `main`

```bash
git branch -M main
```

### Add GitHub Remote

```bash
git remote add origin git@github.com:<your-username>/cs4421-astro-blog.git
```

### Push to GitHub

```bash
git push -u origin main
```

---

# 14. Week 1 Deliverables

* [ ] Personal GitHub repository created: `cs4421-astro-blog`
* [ ] Astro development server runs successfully:

```bash
npm run dev
```

* [ ] Local site available at:

```text
http://localhost:4321
```

* [ ] Commit history uses Conventional Commits
* [ ] `.gitignore` correctly ignores:

  * `node_modules/`
  * `dist/`
  * `.env`

---

# 15. Week 2 Quiz

The Week 2 Block 1 quiz covers:

* SDLC concepts
* Software Methodologies Landscape
* DevOps
* CALMS
* Git internals

The quiz takes place during the **first 15 minutes of Week 2 Block 1** and uses a **locked single tab**.
