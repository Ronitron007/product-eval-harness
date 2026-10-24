# Mastra primitives for the product evaluation harness

Verified against `@mastra/core@1.79.0`, `@mastra/evals@1.10.8`, `@mastra/memory@1.39.0`, `@mastra/libsql@1.27.0`, `@mastra/rag@2.7.0`, and `@mastra/observability@1.21.0`. Date of the check is 2026-10-24.

This file is a reference for the design of the product evaluation harness. It maps each part of the design to a Mastra primitive. It also states the gap when no primitive fits.

## How to read this file `mastra_ref.how_to_read`

Each claim has one of these labels:

- **verified (read X)** means that the embedded doc file or the type definition file X states the claim.

- **verified (type-checked)** means that a small TypeScript probe that uses the API compiled with exit code 0.

- **not verified** means that no source in the installed packages confirms the claim.

- **inferred** means that the claim follows from verified facts, but no source states it.

The probes used TypeScript 5.9.3 with `module: ES2022`, `moduleResolution: bundler`, and `strict: true`. No probe ran. No probe called a model. Four checks are negative controls. Each negative control uses `@ts-expect-error`, so the compile fails if the API accepts the code.

The embedded docs live in `node_modules/@mastra/<package>/dist/docs/references/`. This file cites each doc by its file name and by the public URL that the docs link to. The `@mastra/observability` package has no embedded docs. Its claims come from the `@mastra/core` docs.

Terms used in this file:

- A **step** is one unit of work in a workflow. It has an input schema, an output schema, and an `execute` function.

- A **workflow** is a graph of steps with fixed control flow.

- An **agent** is a model loop that can call tools until it stops.

- A **processor** is an object with hooks that run inside the agent loop, before and after each model call.

- A **tripwire** is the error that a processor throws when it calls `abort()`.

- A **scorer** is a pipeline that returns a number from 0 to 1 for one input and output pair.

- A **classifier** is a Mastra wrapper around a decision model that answers fixed questions with typed answers.

- A **decision model** is an AI SDK model type (`DecisionModelV4`) that returns choices, scores, or probabilities instead of text.

- A **dataset** is a versioned set of test items. An **experiment** runs every item of a dataset through a target.

- **Request context** is a typed key and value map that Mastra passes to agents, tools, steps, processors, and scorers for one request.

- A **verdict** in our design is one of `pass`, `fail`, or `cannot_verify`.

## Workflows `mastra_ref.workflows`

### Steps and workflows `mastra_ref.workflows.schemas`

**Answer.** `createStep()` takes `inputSchema`, `outputSchema`, `stateSchema`, `suspendSchema`, `resumeSchema`, and `requestContextSchema`. Each schema is any Standard JSON Schema value, for example Zod, Valibot, or ArkType. A step also takes `retries`, `metadata`, and `scorers`. The `execute` function receives `inputData`, `resumeData`, `suspendData`, `state`, `setState`, `suspend`, `bail`, `getStepResult`, `getInitData`, `requestContext`, `retryCount`, and `runId`. `createWorkflow()` takes the same schemas plus `retryConfig`, `schedule`, and `options`. Label: verified (type-checked). Exception: `schedule` is only verified (read docs).

**Signature.** From `reference-workflows-step.md`:

```text
**resumeSchema** (`StandardJSONSchemaV1`): Optional Standard JSON Schema for resuming the step
**suspendSchema** (`StandardJSONSchemaV1`): Optional Standard JSON Schema for suspending the step
**stateSchema** (`StandardJSONSchemaV1`): Optional Standard JSON Schema for the step state. ...
**requestContextSchema** (`StandardJSONSchemaV1`): Standard JSON Schema for validating request context values. ...
**retries** (`number`): Number of times to retry the step's execute function if it throws.
```

**Reference.** `reference-workflows-step.md` (https://mastra.ai/reference/workflows/step), `reference-workflows-workflow.md` (https://mastra.ai/reference/workflows/workflow), `docs-workflows-workflow-state.md` (https://mastra.ai/docs/workflows/workflow-state).

**Fit.** Good. A stage maps to one workflow. The workflow state can carry the rule ids and versions that each output passed. The workflow option `onStart` runs before any step, and an error thrown in it stops the run. It can act as a pre-flight gate, for example a budget check. Label: verified (read `reference-workflows-workflow.md`).

### Control flow `mastra_ref.workflows.control_flow`

**Answer.** The workflow builder has these methods:

- `.then(step)` runs steps in sequence.

- `.parallel([a, b])` runs steps at the same time. The output is an object keyed by step id. If one step throws, the whole block fails. There is no concurrency limit.

- `.branch([[condition, step], ...])` runs every branch whose condition is true. It does not stop at the first match. A condition is a function or a declarative `{ predicate }` object.

- `.dountil(step, condition)` and `.dowhile(step, condition)` repeat one step. The condition receives `iterationCount`, which starts at 1.

- `.foreach(step, { concurrency })` runs a step for each array item. The default concurrency is 1.

- `.map(fn | object)` reshapes data. The object form uses `mapVariable()`.

- `.sleep(ms | fn)` and `.sleepUntil(date | fn)` pause the run.

- `.classifier(classifierOrId, options, { id })` adds a classifier step. `.agent()` and `.tool()` add declarative agent and tool steps.

Every control-flow method also takes an optional last argument with `id`, `description`, and `metadata`. Label: verified (type-checked) for all methods above except `.sleepUntil`, `.classifier`, `.agent`, and `.tool`, which have the label verified (read docs).

**Signature.** From `docs-workflows-control-flow.md`:

```text
| `.then(step)`       | Sequential processing              | `T`   | `U`              | N/A (one at a time) |
| `.parallel([a, b])` | Different operations on same input | `T`   | `{ a: U, b: V }` | All run simultaneously |
| `.foreach(step)`    | Same operation on each array item  | `T[]` | `U[]`            | Configurable (default: 1) |
| `.branch([...])`    | Conditional path selection         | `T`   | `{ stepId: U }`  | All branches whose condition is true run simultaneously by default; `perStep: true` schedules only the first matching branch |
```

**Reference.** `docs-workflows-control-flow.md` (https://mastra.ai/docs/workflows/control-flow), `reference-workflows-workflow-methods-branch.md`, `reference-workflows-workflow-methods-dountil.md`, `reference-workflows-workflow-methods-foreach.md`, `reference-workflows-workflow-methods-map.md`, `reference-workflows-workflow-methods-classifier.md` (https://mastra.ai/reference/workflows/workflow-methods/classifier).

**Fit.** Good. The repair loop maps to `.dountil()` over a nested workflow that generates and then judges. The loop condition reads `iterationCount` and stops at the budget. The ruleset judge maps to `.parallel()` over one step for each rule. Two traps exist:

- `.branch()` runs every true branch. Write exclusive conditions.

- In a loop, a value reaches the next iteration only when the body schema declares it. A Zod object schema removes other keys. Label: verified (read `docs-workflows-control-flow.md`).

### Workflow as a step `mastra_ref.workflows.nesting`

**Answer.** Pass a committed workflow to any method that accepts a step, for example to `.then()`, `.parallel()`, `.foreach()`, or `.dountil()`. State flows from the parent workflow to the child workflow. `cloneWorkflow(workflow, { id })` reuses a workflow under a new id. Label: verified (type-checked) for nesting in `.then()`, verified (read docs) for state and cloning.

**Signature.** From `docs-workflows-overview.md`:

```typescript
export const testWorkflow = createWorkflow({
  id: "test-workflow",
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ emphasized: z.string() })
})
  .then(childWorkflow)
  .commit();
```

**Reference.** `docs-workflows-overview.md` (https://mastra.ai/docs/workflows/overview), `docs-workflows-workflow-state.md`.

**Fit.** Good. Each graph level (top, middle, leaf) can have its own stage workflow. A parent workflow can compose them.

### Dynamic workflows `mastra_ref.workflows.dynamic`

**Answer.** Mastra has two ways to build a workflow at run time:

- Build it in code with `createWorkflow()` and register it with `mastra_ref.addWorkflow(workflow, key)`. Steps can hold closures. The registration is not persisted. The method throws when the key already exists. Label: verified (read `mastra/index.d.ts`).

- Register a JSON definition with `mastra_ref.addDynamicWorkflow(definition)`. The feature is beta. Mastra validates the structure, the references, and the schema flow before it stores the definition in the `workflowDefinitions` storage domain. Mastra loads stored definitions again at startup. Label: verified (type-checked).

A JSON definition has no code. Its graph entries are `agent`, `classifier`, `tool`, `mapping`, `workflow`, `parallel`, `conditional`, `foreach`, `loop`, `sleep`, and `sleepUntil`. Each entry refers to a component that the `Mastra` instance holds in its registry.

Conditions use a JSON predicate language. An agent entry stores only `outputSchema`, `retries`, and `metadata`. A new definition with the same id replaces the old one for new runs. Runs that already started keep the old graph. Label: verified (read docs).

**Signature.** From `reference-workflows-dynamic-workflow-definition.md`:

```text
| `agent`       | Invoke a registered agent                              |
| `classifier`  | Evaluate data with a registered classifier             |
| `tool`        | Invoke a registered tool                               |
| `mapping`     | Reshape data between steps                             |
| `workflow`    | Invoke a registered workflow as a nested step          |
| `parallel`    | Run several steps concurrently and merge their outputs |
| `conditional` | Run every branch whose predicate is true, concurrently |
| `foreach`     | Run one step per item of an array input                |
| `loop`        | Repeat a step while or until a predicate holds         |
```

**Reference.** `docs-workflows-dynamic-workflows.md` (https://mastra.ai/docs/workflows/dynamic-workflows), `reference-workflows-dynamic-workflow-definition.md` (https://mastra.ai/reference/workflows/dynamic-workflow-definition).

**Fit.** Partial. A ruleset version can compile to a JSON definition with an id such as `stage-sunscreen-ruleset-12`. The definition then survives restarts and records the ruleset in `metadata`. Each deterministic check must first exist as a registered tool, and each LLM judge as a registered agent, classifier, or workflow. Mapping entries must stay at the top level of the graph. The beta label means that the format can change in a minor release.

### Errors and retries `mastra_ref.workflows.errors`

**Answer.** A run result has the status `success`, `failed`, `suspended`, `tripwire`, or `paused`. A step retries with `retries`. A workflow sets a default with `retryConfig: { attempts, delay }`.

A step ends the run early with a success result through `bail(payload)`. A thrown error fails the step. The callbacks `onFinish` and `onError` run at the end, but Mastra catches their errors and does not retry them. Label: verified (type-checked) for `retries`, `retryConfig`, and `bail`. Verified (read docs) for the callbacks.

**Signature.** From `workflows/types.d.ts`:

```typescript
    retryConfig?: {
        attempts?: number;
        delay?: number;
    };
```

**Reference.** `docs-workflows-error-handling.md` (https://mastra.ai/docs/workflows/error-handling).

**Fit.** Good for transient errors. A retry runs the same `execute` again with the same input. It does not send the error to a model. The repair loop with the exact error must use a loop or a processor. See `mastra_ref.processors.repair`.

### Snapshots and time travel `mastra_ref.workflows.snapshots`

**Answer.** Mastra writes a snapshot when a step suspends. The snapshot holds the input, each step status, the suspend and resume payloads, the execution path, and the request context. The table is `workflow_snapshots`, keyed by run id.

`run.timeTravel({ step, inputData | context | resumeData, initialState })` runs a workflow again from one step. Time travel needs storage. It fails before it runs anything when the workflow definition changed since the run. `workflow.getWorkflowRunById()` and `createWorkflowStateReader()` read a stored run. `run.restart()` continues an active run after a crash. Label: verified (type-checked) for `timeTravel`, `getWorkflowRunById`, and `createWorkflowStateReader`. Verified (read docs) for the rest.

**Signature.** From `docs-workflows-time-travel.md`:

```typescript
const result = await run.timeTravel({
  step: 'step2',
  inputData: { previousStepResult: 'custom value' },
})
```

**Reference.** `docs-workflows-snapshots.md` (https://mastra.ai/docs/workflows/snapshots), `docs-workflows-time-travel.md` (https://mastra.ai/docs/workflows/time-travel), `reference-workflows-workflow-state-reader.md`.

**Fit.** Partial. Time travel helps to debug one stage and to run a failed judge step again. It is not a good tool to run a new rule version over old outputs, because it acts on an existing run record. Use a new run or an experiment for that. Label: inferred.

### Human approval `mastra_ref.workflows.approval`

**Answer.** A step calls `suspend(payload, { resumeLabel })`. The payload must match `suspendSchema`. The run returns `status: 'suspended'` and the list of suspended step paths.

Later code calls `run.resume({ step, resumeData, forEachIndex })` with data that matches `resumeSchema`. Any process can resume the run with `workflow.createRun({ runId })`. A reject decision calls `bail()`. State survives the suspend and resume cycle. Label: verified (type-checked).

**Signature.** From `docs-workflows-suspend-and-resume.md`:

```typescript
const workflow = mastra.getWorkflow('testWorkflow')
const run = await workflow.createRun({ runId: '123' })

const stream = run.resume({
  resumeData: { approved: true },
})
```

**Reference.** `docs-workflows-suspend-and-resume.md` (https://mastra.ai/docs/workflows/suspend-and-resume), `docs-workflows-human-in-the-loop.md` (https://mastra.ai/docs/workflows/human-in-the-loop).

**Fit.** Good. The approval step suspends with the failed rule ids, the output, and the evidence. The reviewer decision returns as `resumeData`.

## Agents `mastra_ref.agents`

### Structured output `mastra_ref.agents.structured_output`

**Answer.** Pass `structuredOutput: { schema }` to `generate()` or `stream()`. The schema can be Zod, another Standard JSON Schema library, or plain JSON Schema. Mastra sends the schema through the provider response format by default. `jsonPromptInjection` puts the schema in the prompt instead. `model` adds a second structuring model. `errorStrategy` controls a schema failure:

- `strict` (default) throws an error.

- `warn` logs a warning and continues.

- `fallback` returns `fallbackValue` and sets `usedFallbackValue: true` on the result.

There is no option that retries the model with the validation error. A probe that passes `maxRetries` inside `structuredOutput` fails to compile. Label: verified (type-checked), including the negative control.

**Signature.** From `agent/types.d.ts`:

```typescript
type FallbackFields<OUTPUT = undefined> = {
    errorStrategy?: 'strict' | 'warn';
    fallbackValue?: never;
} | {
    errorStrategy: 'fallback';
    fallbackValue: OUTPUT;
};
```

**Reference.** `docs-agents-structured-output.md` (https://mastra.ai/docs/agents/structured-output), `reference-agents-generate.md` (https://mastra.ai/reference/agents/generate).

**Fit.** Partial. The schema can come from the rules at run time. A schema failure throws, and the stage must catch it. The repair loop must come from a processor retry or a workflow loop. The `fallback` strategy hides a failure behind a stored value, so do not use it for rule outputs.

### Dynamic configuration `mastra_ref.agents.dynamic`

**Answer.** The `Agent` constructor accepts a function of `{ requestContext }` for `instructions`, `model`, `tools`, `agents`, `workflows`, `memory`, `scorers`, `inputProcessors`, `outputProcessors`, `defaultOptions`, and `skills`. Each function can be async. A call to `generate()` can also replace `instructions`. A `requestContextSchema` on the agent validates the context before the run. Label: verified (type-checked) for the functions on `instructions`, `model`, and `tools`. Verified (read docs) for the other fields.

**Signature.** From `reference-agents-agent.md`:

```text
**instructions** (`SystemMessage | ({ requestContext: RequestContext }) => SystemMessage | Promise<SystemMessage>`): ...
**model** (`MastraLanguageModel | ({ requestContext: RequestContext }) => MastraLanguageModel | Promise<MastraLanguageModel>`): ...
**tools** (`ToolsInput | ({ requestContext: RequestContext, mastra?: Mastra }) => ToolsInput | Promise<ToolsInput>`): ...
```

**Reference.** `reference-agents-agent.md` (https://mastra.ai/reference/agents/agent), `docs-server-request-context.md` (https://mastra.ai/docs/server/request-context).

**Fit.** Good. One research agent can serve every graph node. The instructions function reads the node id, the inherited criteria, and the active rule texts from request context.

### Loop limits `mastra_ref.agents.loop_limits`

**Answer.** `generate()` and `stream()` take these limits and controls:

- `maxSteps` sets the maximum number of loop steps.

- `stopWhen` sets stop conditions.

- `modelSettings.timeout` takes `totalMs`, `stepMs`, and `firstChunkMs`. A `totalMs` timeout ends the run with `MastraTimeoutError`.

- `onIterationComplete` returns `{ continue, feedback }` after each iteration.

- `isTaskComplete: { scorers, strategy, onComplete, parallel, timeout }` runs scorers after each iteration. A failed scorer adds its feedback to the conversation, and the loop continues.

The docs do not state a default for `maxSteps`. Label: verified (type-checked) for `maxSteps`, `modelSettings.timeout`, `onIterationComplete`, and `isTaskComplete`. The default is not verified.

**Signature.** From `reference-agents-generate.md`:

```text
**options.isTaskComplete.scorers** (`MastraScorer[]`): Array of scorers that evaluate task completion. Each scorer returns 0 (failed) or 1 (passed).
**options.isTaskComplete.strategy** (`'all' | 'any'`): Strategy for combining scorer results. 'all' requires all scorers to pass, 'any' requires at least one.
```

**Reference.** `reference-agents-generate.md`, `docs-subagents.md` (https://mastra.ai/docs/subagents).

**Fit.** Good. `isTaskComplete` with `strategy: 'all'` and one scorer for each strict rule gives "continue until all rules pass". `maxSteps` and `totalMs` give the stop. See also `mastra_ref.harness.goals`.

### Subagents and networks `mastra_ref.agents.subagents`

**Answer.** Put agents in the `agents` property of a parent agent. The parent agent, called a supervisor, calls each subagent as a tool. The `delegation` option has these hooks:

- `onDelegationStart` can reject a call, change the prompt, set `modifiedMaxSteps`, and set values on the subagent request context.

- `onDelegationComplete` can call `bail()`, return `feedback`, or replace the result text with `resultText`.

- `messageFilter` limits the messages that the subagent sees.

Each delegation gets a shallow copy of the request context and a fresh memory thread. The docs mark agent networks (`.network()`) as deprecated and point to supervisor agents. Mastra has no council primitive. The docs build a council with `.parallel()` in a workflow. Label: verified (read docs).

**Signature.** From `docs-subagents.md`:

```typescript
const stream = await parentAgent.stream('Research AI trends', {
  maxSteps: 10,
  delegation: {
    onDelegationStart: async context => {
      context.requestContext.set('audience', 'technical')
    },
  },
})
```

**Reference.** `docs-subagents.md` (https://mastra.ai/docs/subagents), `docs-agents-networks.md`, `docs-guides-multi-agent-systems.md` (https://mastra.ai/docs/guides/multi-agent-systems), `reference-migrations-network-to-supervisor.md` (https://mastra.ai/reference/migrations/network-to-supervisor).

**Fit.** Good for a research stage that sends sub-questions to specialist researchers. For a fixed stage order, a workflow is more predictable than a supervisor.

## Processors and guardrails `mastra_ref.processors`

### Hooks and abort `mastra_ref.processors.hooks`

**Answer.** A processor implements one or more of these hooks: `processInput`, `processInputStep`, `computeStateSignal`, `processLLMRequest`, `processLLMResponse`, `processOutputStream`, `processOutputStep`, `processToolResult`, `processOutputResult`, and `processAPIError`. An agent has three lists: `inputProcessors`, `outputProcessors`, and `errorProcessors`. Each list can also contain a workflow that uses `ProcessorStepSchema`.

A processor stops the run with `abort(reason, { retry, metadata })`. The abort throws a `TripWire`. A stream then emits a `tripwire` chunk. A `generate()` result has `result.tripwire` and `finishReason: 'other'`. A workflow that holds the agent ends with `status: 'tripwire'`.

Every processor has an `onViolation` callback. Label: verified (read `processors/index.d.ts`), and verified (type-checked) for `processOutputStep` with `abort`.

**Signature.** From `agent/trip-wire.d.ts`:

```typescript
export interface TripWireOptions<TMetadata = unknown> {
    /**
     * If true, the agent should retry with the tripwire reason as feedback.
     * The failed response will be added to message history along with the reason.
     */
    retry?: boolean;
    metadata?: TMetadata;
}
```

**Reference.** `docs-agents-processors.md` (https://mastra.ai/docs/agents/processors), `reference-processors-processor-interface.md` (https://mastra.ai/reference/processors/processor-interface), `docs-agents-guardrails.md` (https://mastra.ai/docs/agents/guardrails).

**Fit.** Good. A ruleset guard can run as an output processor on the agent of each stage.

### Repair with the exact error `mastra_ref.processors.repair`

**Answer.** Yes. In `processOutputStep` or `processInputStep`, call `abort(message, { retry: true })`. Mastra replays the step and adds the message, word for word, at the end of the conversation as a system reminder. The processor reads `retryCount` to stop. The agent or the call must set `maxProcessorRetries`. Without it, these retries are off.

`processAPIError` retries have a separate budget with a default of 3. `processToolResult` can also abort with `retry: true`. Label: verified (type-checked) for the abort with `retry`, `retryCount`, and `maxProcessorRetries`. Verified (read docs) for the replay behavior.

**Signature.** From `docs-agents-processors.md`:

```text
The retry mechanism:

- Works in `processOutputStep()` and `processInputStep()` methods
- Replays the step with the abort reason appended verbatim to the end of the conversation as a system reminder. ...
- Tracks retry count via the `retryCount` parameter
- Requires an explicit `maxProcessorRetries` limit on the agent or call
```

**Reference.** `docs-agents-processors.md` (https://mastra.ai/docs/agents/processors).

**Fit.** Good. This is the strict binding: refuse and repair with the exact error, under a budget. Three gaps remain:

- `ProcessOutputStepArgs` gives `text`, `toolCalls`, `steps`, and `messages`. It does not give the parsed structured object. The processor must parse the JSON from `text`. Label: verified (read `processors/index.d.ts`) for the fields, inferred for the need to parse.

- Each retry adds the failed answer and the reason to the conversation, so the context grows with each round. Label: verified (read `trip-wire.d.ts`).

- Processors attach to agents. A code step in a workflow has no processor. Use a `.dountil()` loop there.

### Built-in guardrails and budgets `mastra_ref.processors.builtins`

**Answer.** `@mastra/core/processors` includes `ModerationProcessor`, `PIIDetector`, `PromptInjectionDetector`, `UnicodeNormalizer`, `LanguageDetector`, `SystemPromptScrubber`, `TokenLimiterProcessor`, `TokenCostControl`, `ClassifierProcessor`, `StreamErrorRetryProcessor`, and others. Many take a `strategy` of `block`, `warn`, `detect`, `redact`, `rewrite`, or `translate`. `TokenCostControl` blocks or warns when cost passes `maxCost` in a scope such as `run`, `thread`, or `resource`. Its cost check is approximate. It counts only model calls inside an agent run. Label: verified (type-checked) for `TokenCostControl`, verified (read docs) for the others.

**Signature.** From `reference-processors-token-cost-control.md`:

```text
> **Approximate cost control.** Cost data is persisted asynchronously via buffered exporters in the observability pipeline. Fast-running agents may exceed the configured limit before metrics are available for query. ...
> **Agent attribution only.** Cost is attributed via the `entityType: 'agent'` metric filter. Model calls made outside an agent run ... aren't counted by this guard.
```

**Reference.** `docs-agents-guardrails.md`, `reference-processors-token-cost-control.md` (https://mastra.ai/reference/processors/token-cost-control), `reference-processors-classifier-processor.md` (https://mastra.ai/reference/processors/classifier-processor).

**Fit.** Partial. The soft binding maps to a `warn` strategy and `onViolation`. A money budget for a stage needs our own ledger, because `TokenCostControl` is approximate and skips judge calls made outside an agent.

## Scorers `mastra_ref.scorers`

### createScorer `mastra_ref.scorers.create`

**Answer.** `createScorer({ id, name, description, judge, type, prepareRun })` returns a builder. Chain `.preprocess()`, `.analyze()`, `.generateScore()`, and `.generateReason()`. Only `.generateScore()` is mandatory. Each step is either a plain function or a prompt object with `description`, `createPrompt`, and an `outputSchema` (not for `generateScore`). Only prompt-object steps call the judge model.

The `judge` takes `model`, `instructions`, `jsonPromptInjection`, `inputProcessors`, `outputProcessors`, `errorProcessors`, and `maxProcessorRetries`. A step can override the judge. `scorer.run({ input, output, groundTruth, requestContext, runId })` returns `score`, `reason`, each step result, each prompt, and a `judge` record with usage and cost. Label: verified (type-checked).

**Signature.** From `reference-evals-create-scorer.md`:

```typescript
const scorer = createScorer({
  id: 'my-custom-scorer',
  name: 'My Custom Scorer', // Optional, defaults to id
  description: 'Evaluates responses based on custom criteria',
  type: 'agent', // Optional: for agent evaluation with automatic typing
  judge: {
    model: myModel,
    instructions: 'You are an expert evaluator...',
  },
})
  .preprocess({/* step config */})
  .analyze({/* step config */})
  .generateScore(({ run, results }) => {
```

**Reference.** `reference-evals-create-scorer.md` (https://mastra.ai/reference/evals/create-scorer), `docs-evals-custom-scorers.md` (https://mastra.ai/docs/evals/custom-scorers), `reference-evals-mastra-scorer.md`.

**Fit.** Good. A code scorer uses only function steps. An LLM judge scorer uses an `analyze` prompt step that returns `{ verdict, reason }`, then a function `generateScore`. One rule version maps to one scorer id, for example `rule-r3-v2`.

### notScorable `mastra_ref.scorers.not_scorable`

**Answer.** A function step returns `notScorable(reason)` when the run has nothing for the scorer to judge. The remaining steps do not run. `scorer.run()` returns `notScorable: { step, reason }` and no `score`.

Live scoring stores no row. `runEvals()` leaves the run out of averages, gates, and the verdict, and counts it in `summary.notScorable`. Experiments store `score: null` with `notScorable`. Prompt-object steps cannot return it. Label: verified (type-checked) for the return and the result field. Verified (read docs) for storage behavior.

**Signature.** From `reference-evals-not-scorable.md`:

```text
- Accepted from any function step: `preprocess`, `analyze`, `generateScore`, or `generateReason`. Prompt-object steps can't return it ...
- `scorer.run()` resolves with `notScorable: { step, reason? }` and no `score` key.
- Live scoring stores no score row. [`runEvals()`] leaves the run out of averages, gates, thresholds, and the verdict, and counts it in `summary.notScorable`. Experiments set `score: null`, `error: null`, and `notScorable`.
```

**Reference.** `reference-evals-not-scorable.md` (https://mastra.ai/reference/evals/not-scorable).

**Fit.** Weak for `cannot_verify`. `notScorable` means "this rule does not apply here". Our `cannot_verify` means "the rule applies, but the evidence is not enough". Live scoring drops the outcome, and `runEvals` removes it from the gate. That is a silent pass for a strict rule. Use `notScorable` only for rules out of scope. Store `cannot_verify` in our own verdict record.

### Attach scorers, sampling, and storage `mastra_ref.scorers.attach`

**Answer.** Attach scorers as `{ name: { scorer, sampling: { type: 'ratio', rate }, filter } }` on an agent, on a step, or in `.agent()` and `.tool()` options. Live scoring runs after the agent or step finishes. It runs in the background and does not block the run. Sampling is deterministic for each trace id.

The `filter` is a JSON predicate over `requestContext.*`, `entity.*`, and other run fields. Scores go to the `scores` storage domain, table `mastra_scorers`. A score persists only when the `Mastra` instance has storage and lists the scorer in its `scorers` option. Label: verified (read `docs-evals-overview.md`, `reference-workflows-step.md`).

**Signature.** From `docs-evals-overview.md`:

```typescript
  scorers: {
    relevancy: {
      scorer: createAnswerRelevancyScorer({ model: 'openai/gpt-5-mini' }),
      filter: {
        op: 'eq',
        left: { path: 'requestContext.plan' },
        right: { literal: 'enterprise' },
      },
      sampling: { type: 'ratio', rate: 0.1 },
    },
  },
```

**Reference.** `docs-evals-overview.md` (https://mastra.ai/docs/evals/overview), `reference-workflows-step.md`.

**Fit.** Good for the watch-only binding. A new rule version runs as a live scorer with a sampling rate and logs scores without a block. A score row keeps `scorerId`, `requestContext`, `metadata`, `analyzeStepResult`, `reason`, `traceId`, and `spanId`, so the rule id and version can ride in the scorer id or the request context. Label: verified (read `evals/types.d.ts`). Live scorers cannot gate a run, because they run after the step and in the background. A strict gate must call `scorer.run()` inside a step, or use `isTaskComplete` or a goal scorer.

### runEvals, gates, and verdicts `mastra_ref.scorers.run_evals`

**Answer.** `runEvals({ target, data, scorers, gates, targetOptions, concurrency, onItemComplete })` runs each data item through an agent or a workflow, then runs the scorers. A gate must average 1.0 over the items that it scored. A gate that throws counts as 0.

A scorer entry `{ scorer, threshold }` takes a number (minimum) or `{ min, max }`. The result has `scores`, `summary`, `verdict`, `gateResults`, and `thresholdResults`. The verdict is `passed`, `scored`, or `failed`. Label: verified (type-checked).

**Signature.** From `docs-evals-gates-and-verdicts.md`:

```text
- `failed`: At least one gate averaged below 1.0 across data items
- `scored`: All gates passed, but at least one threshold scorer missed its threshold
- `passed`: All gates scored 1.0 and all thresholds were met
```

**Reference.** `reference-evals-run-evals.md` (https://mastra.ai/reference/evals/run-evals), `docs-evals-gates-and-verdicts.md` (https://mastra.ai/docs/evals/gates-and-verdicts), `docs-evals-running-in-ci.md`.

**Fit.** Good for batch checks, for example a CI gate over golden examples. It is not an inline judge for one live output. The verdict `passed`, `scored`, `failed` describes a batch. It is not our per-rule verdict.

### Quick Checks and the rubric scorer `mastra_ref.scorers.quick_checks`

**Answer.** `@mastra/evals/checks` exports scorers that need no model: `includes`, `excludes`, `equals`, `matches`, `similarity`, `calledTool`, `didNotCall`, `toolOrder`, `maxToolCalls`, `usedNoTools`, and `noToolErrors`. They check text and tool calls only. `createRubricScorer({ model, criteria })` from `@mastra/evals/scorers/prebuilt` is an LLM judge that returns 1 only when every required criterion passes. Its `reason` lists each criterion. If no rubric resolves at run time, it returns 1. Label: verified (type-checked) for `checks.includes` and `createRubricScorer`. Verified (read docs) for the rest.

**Signature.** From `reference-evals-rubric.md` in `@mastra/evals`:

```text
**criteria** (`RubricCriterion[] | string`): The rubric to grade against. A string is treated as a newline-delimited checklist (each line becomes a required criterion). If omitted, the rubric is read at run time from a rubric value on request/additional context; if none resolves, the scorer is a no-op and returns 1.
```

**Reference.** `docs-evals-quick-checks.md` (https://mastra.ai/docs/evals/quick-checks), `reference-evals-checks.md` (https://mastra.ai/reference/evals/checks), `reference-evals-rubric.md` (https://mastra.ai/reference/evals/rubric).

**Fit.** Partial. Quick Checks do not check JSON fields, so rule checks on structured output need our own code scorers. The rubric scorer has no `cannot_verify` outcome. Its silent pass when no rubric resolves breaks a strict rule. Always pass `criteria` in code.

## Classifier `mastra_ref.classifier`

**Answer.** `new Classifier({ id, model, questions })` asks a decision model fixed questions about one JSON `state`. A question is `choice` (one key from `criteria`), `score` (a level from an ordered list), or `boolean` (the probability of true). A model can refuse a question. A refusal is `{ type: 'refusal' }`.

`decide({ state, questions, maxRetries, abortSignal, providerOptions })` returns `answers`, `usage`, `warnings`, `rounding`, `providerMetadata`, and `response`. The model must be an AI SDK decision model. A `'provider/model'` string fails to compile. A classifier with constructor questions works in four places:

- `createStep(classifier, { maxRetries, retries })` makes a workflow step.

- `.classifier()` adds a declarative workflow step.

- `ClassifierProcessor` runs it inside an agent.

- `createClassifierScorer({ classifier, question, scores, state, type })` turns one question into a scorer. A choice question needs a score for every choice. A refusal makes the scorer throw `ScorerRunError`. Each scorer run asks every question on the classifier.

Label: verified (type-checked) for the constructor, `createStep`, `createClassifierScorer`, and the string negative control. Verified (read docs) for the rest. The docs say that the OpenAI, Anthropic, Google, and TypeSafe AI SDK providers expose `decisionModel()`. Label: not verified, because those packages are not installed.

**Signature.** From `reference-classifier-classifier.md`:

```typescript
const questions = {
  sentiment: {
    type: 'choice',
    instructions: 'Classify the customer sentiment.',
    criteria: {
      positive: 'The customer is satisfied or complimentary.',
      neutral: 'The customer has no clear positive or negative sentiment.',
      negative: 'The customer is dissatisfied or frustrated.',
    },
  },
} as const
```

**Reference.** `reference-classifier-classifier.md` (https://mastra.ai/reference/classifier/classifier), `reference-evals-create-classifier-scorer.md` (https://mastra.ai/reference/evals/create-classifier-scorer), `reference-workflows-workflow-methods-classifier.md`, `reference-processors-classifier-processor.md`.

**Fit.** Good shape, with gaps. One rule question maps to one classifier with one `choice` question whose criteria are `pass`, `fail`, and `cannot_verify`. The answer has a type, and probabilities can show doubt. The gaps:

- The answer has no reason text and no evidence. A failed rule needs a reason for the repair loop.

- The judge cannot call tools to check facts.

- A refusal is not `cannot_verify`. The classifier scorer throws on a refusal, so the stage must catch it.

- The judge needs a decision-model provider, not the language model of the agents.

## Datasets and experiments `mastra_ref.datasets`

### Datasets `mastra_ref.datasets.items`

**Answer.** `mastra_ref.datasets.create({ name, description, inputSchema, groundTruthSchema })` makes a dataset. The schemas reject bad items at insert time.

`addItem`, `addItems`, `updateItem`, `deleteItem`, and `deleteItems` each make a new dataset version. `purgeItem` redacts an item in every version and does not make a version. `listVersions`, `getItemHistory`, and `listItems({ version })` read the history. An item can carry `scorerIds` and an `externalId`. `createDatasetSnapshot()` and `parseDatasetSnapshot()` make a JSON file of a dataset with a SHA-256 digest. Label: verified (type-checked) for `create` and `addItems`. Verified (read docs) for the rest.

**Signature.** From `docs-evals-datasets.md`:

```typescript
const dataset = await mastra.datasets.create({
  name: 'translation-pairs',
  inputSchema: z.object({
    text: z.string(),
    sourceLang: z.string(),
    targetLang: z.string(),
  }),
  groundTruthSchema: z.object({
    translation: z.string(),
  }),
})
```

**Reference.** `docs-evals-datasets.md` (https://mastra.ai/docs/evals/datasets), `reference-datasets-dataset.md` (https://mastra.ai/reference/datasets/dataset).

**Fit.** Good. Each rule gets one golden dataset. The ground truth holds the expected verdict. The dataset version pins the golden set that a rule version passed.

### Experiments and comparison `mastra_ref.datasets.experiments`

**Answer.** `dataset.startExperiment({ targetType, targetId, scorers, version, maxConcurrency, itemTimeout, maxRetries, requestContext, agentVersion, versions, provenance, grouping, metadata, persistence })` runs every item. The target type is `agent`, `workflow`, or `scorer`. A scorer target tests the judge itself. `grouping` takes `experimentSetId`, `comparisonId`, `variantId`, and `trialIndex`. `provenance` takes `source`, `sourceId`, `sourceVersion`, and `metadata`.

A caller-driven mode uses `createExperiment`, `runExperimentItem`, `submitExperimentResult`, and `finalizeExperiment`, and each call is idempotent. `mastra_ref.datasets.compareExperiments({ experimentIds, baselineId })` returns the output and the scores of each item for each experiment. Label: verified (type-checked) for `startExperiment` with `grouping`, `provenance`, `requestContext`, and `compareExperiments`. Verified (read docs) for the caller-driven mode.

**Signature.** From `storage/types.d.ts`:

```typescript
export interface ExperimentGrouping {
    /** Overall study or benchmark campaign identifier. */
    experimentSetId?: string;
    /** Controlled comparison identifier within the experiment set. */
    comparisonId?: string;
    /** Alternative identifier within the comparison. */
    variantId?: string;
    /** Zero-based repetition index for the variant. */
    trialIndex?: number;
}
```

**Reference.** `docs-evals-experiments.md` (https://mastra.ai/docs/evals/experiments), `reference-datasets-startExperiment.md` (https://mastra.ai/reference/datasets/startExperiment), `reference-datasets-compareExperiments.md` (https://mastra.ai/reference/datasets/compareExperiments).

**Fit.** Good for data, weak for decisions. Run the current rule version and the candidate version as two experiments on the same pinned dataset version. Use one `comparisonId` and two `variantId` values. The gaps:

- `compareExperiments` returns rows only. It gives no delta, no statistics, and no promotion decision.

- Experiment status and counts describe execution, not quality. Gates and verdicts exist only in `runEvals`.

## Editor and versioning `mastra_ref.editor`

**Answer.** The editor lives in the separate package `@mastra/editor`, which is not installed. It versions stored agents (instructions and tools), prompt blocks, stored scorer definitions, MCP clients, workspaces, and skills.

With database storage, each save makes a snapshot. The record keeps `activeVersionId`. The published version is the active one. A draft is a newer snapshot. A restore makes a new draft. With `source: 'code'`, each agent override is one JSON file under `mastra/editor/agents/`, and Git keeps the history.

A prompt block is reusable instruction text. It can use `{{name}}` values from request context and display conditions over request context fields. An agent instruction list mixes `text`, `prompt_block`, and `prompt_block_ref` entries.

At run time, a reference resolves the published block. A missing or unpublished reference drops out of the instructions without an error. `mastra_ref.getAgentById(id, { status | versionId })` picks a version. Label: verified (read docs). Not type-checked, because `@mastra/editor` is not installed.

**Signature.** From `reference-editor-prompt-blocks.md`:

```typescript
await editor.agent.update({
  id: 'support-agent',
  instructions: [
    { type: 'prompt_block_ref', id: 'brand-voice' },
    { type: 'text', content: 'Answer only questions about Acme products.' },
  ],
})
```

**Reference.** `docs-studio-editor.md` (https://mastra.ai/docs/studio/editor), `reference-editor-versioning.md` (https://mastra.ai/reference/editor/versioning), `reference-editor-prompt-blocks.md` (https://mastra.ai/reference/editor/prompt-blocks), `reference-editor-mastra-editor.md` (https://mastra.ai/reference/editor/mastra-editor).

**Fit.** Partial. A rule statement can live as a prompt block with draft and published versions. A display condition can express a simple scope. A stored scorer definition of type `llm-judge` can hold the judge prompt with versions. Label for scorer definitions: verified (read `storage/types.d.ts`). The gaps:

- A prompt block snapshot holds `name`, `description`, `content`, `rules`, and `requestContextSchema`. It has no field for binding, output fields, golden examples, or provenance. The `metadata` field sits on the record, not on each version.

- An unpublished reference drops without an error. A strict rule that drops in silence breaks our design.

- Nothing links a stored score to the prompt block version that produced it.

- The docs disagree about `editor.agent.update()`. `docs-studio-editor.md` and `reference-editor-mastra-editor.md` say that it activates the new version. `reference-editor-versioning.md` says that it makes an inactive draft. Test it before use.

## Harness `mastra_ref.harness`

### Goals `mastra_ref.harness.goals`

**Answer.** An agent with a `goal` config keeps a durable objective for one memory thread. After each iteration, a judge scores the conversation against the objective. The loop continues when the score fails and budget remains. It stops with status `done` when the score passes. It stops with status `paused` when `runsUsed >= maxRuns`.

`goal.scorer` replaces the default judge with any scorer. `goal.judge` must still resolve, because it switches the goal step on. Goals need storage and a memory thread. Each evaluation emits a `goal` stream chunk. Label: verified (type-checked) for `goal: { judge, maxRuns, scorer }`. Verified (read docs) for the loop behavior.

**Signature.** From `agent/types.d.ts`:

```typescript
export interface GoalConfig {
    judge?: DynamicArgument<MastraModelConfig | undefined>;
    /** Max goal evaluations before the goal stops. Defaults to 50. */
    maxRuns?: number;
    /** Extra judge guidance. Defaults to the built-in goal judge prompt. */
    prompt?: string;
    tools?: DynamicArgument<ToolsInput | undefined>;
    maxSteps?: number;
    scorer?: MastraScorer | string;
}
```

**Reference.** `docs-harness-goals.md` (https://mastra.ai/docs/harness/goals), `docs-harness-overview.md`.

**Fit.** Best match for a long research stage. Set `goal.scorer` to a scorer that returns 1 only when every strict rule passes. `maxRuns` is the iteration budget. The gaps:

- The budget counts evaluations, not money. Add `modelSettings.timeout.totalMs` and our own cost ledger.

- The goal needs a memory thread, so each stage run needs a thread id.

- The scorer returns one number, so the per-rule verdicts must go to our store from inside the scorer.

### Durable agents, background tasks, schedules, signals, controller `mastra_ref.harness.other`

**Answer.** Each harness capability has one job:

- A durable agent (`createDurableAgent()` from `@mastra/core/agent/durable`, beta) runs the agent loop inside a workflow. The run survives client disconnects and process restarts.

- A background task runs a slow tool call or subagent without a block on the agent loop. `streamUntilIdle()` keeps the stream open until the tasks finish.

- A schedule runs an agent or a workflow on a cron expression through `mastra_ref.schedules`. It needs a storage adapter with the `schedules` domain.

- A signal sends context into a running or idle agent thread. A signal provider forwards external events.

- `AgentController` hosts interactive sessions with modes, approvals, and subagents.

Label: verified (read docs).

**Signature.** From `docs-harness-overview.md`:

```text
| Keep an agent working until it reaches an objective | [Goals] | Evaluate a thread-scoped objective until it's complete or reaches its run budget. |
| Start work automatically at recurring times | [Schedules] | Start isolated runs or send prompts into an existing thread on a cron schedule. |
```

**Reference.** `docs-harness-durable-agents.md` (https://mastra.ai/docs/harness/durable-agents), `docs-harness-background-tasks.md` (https://mastra.ai/docs/harness/background-tasks), `docs-harness-schedules.md` (https://mastra.ai/docs/harness/schedules), `docs-harness-signals.md` (https://mastra.ai/docs/harness/signals), `docs-harness-agent-controller.md` (https://mastra.ai/docs/harness/agent-controller).

**Fit.** Goals help the most. Durable agents help when a research stage runs for many minutes. Schedules can run the watch-only shadow check of a candidate rule over recent outputs each night. Background tasks help when research subagents run in parallel. Signals and the controller add little for a batch pipeline.

## Storage `mastra_ref.storage`

**Answer.** Mastra storage has a fixed list of 24 domains. The list includes `memory`, `workflows`, `workflowDefinitions`, `scores`, `observability`, `datasets`, `experiments`, `agents`, `promptBlocks`, `scorerDefinitions`, `skills`, `schedules`, `backgroundTasks`, `threadState`, and `knowledge`.

`MastraCompositeStore({ id, default, editor, domains })` sends each domain to a different adapter. It accepts no custom domain. A probe with `domains: { rules: ... }` fails to compile. `LibSQLStore` accepts an existing `client`, so Mastra and our own tables can share one database file. Retention policies and `storage.prune()` remove old rows. Label: verified (type-checked) for the composite store, the negative control, and the shared client. Verified (read `storage/base.d.ts`) for the domain list.

**Signature.** From `storage/base.d.ts`:

```typescript
export declare const DOMAIN_KEYS: readonly ["memory", "workflows", "workflowDefinitions", "scores", "observability", "agents", "datasets", "experiments", "promptBlocks", "scorerDefinitions", "mcpClients", "mcpServers", "workspaces", "skills", "favorites", "blobs", "backgroundTasks", "schedules", "channels", "harness", "toolProviderConnections", "notifications", "threadState", "knowledge"];
```

**Reference.** `docs-storage.md` (https://mastra.ai/docs/storage), `reference-storage-overview.md` (https://mastra.ai/reference/storage/overview), `reference-storage-composite.md` (https://mastra.ai/reference/storage/composite), `reference-storage-retention.md`.

**Fit.** Our graph of nodes, rules, research records, and accepted outputs needs its own database layer. Mastra storage keeps only its own runtime data. The shared client lets both layers use one database and one transaction source. For Postgres, `@mastra/pg` exists, but it is not installed here. Label for `@mastra/pg`: verified (read `docs-storage.md`), not type-checked.

## Request context `mastra_ref.request_context`

**Answer.** Make a `RequestContext<T>` and call `set`. Pass it as `requestContext` to `agent.generate()`, `run.start()`, `run.resume()`, and `tool.execute()`. These places read it:

- Agent config functions read `{ requestContext }`.

- A step reads `execute({ requestContext })`.

- A tool reads `context.requestContext`.

- A processor reads `args.requestContext`.

- A scorer reads `run.requestContext`.

- A classifier scorer reads it in `state({ run })`.

- A prompt block reads it in `{{name}}` values and display conditions.

A `requestContextSchema` on an agent, workflow, step, or tool validates the values and types `get` and `set`. A delegation to a subagent copies the context. The observability option `requestContextKeys` copies keys into span metadata. Experiments take `requestContext` as a plain record. Label: verified (type-checked) for agent, step, tool, and processor access. Verified (read docs) for the rest.

**Signature.** From `docs-server-request-context.md`:

```typescript
const requestContext = new RequestContext<UserTier>()
requestContext.set('user-tier', 'enterprise')

const agent = mastra.getAgent('weatherAgent')
await agent.generate("What's the weather in London?", {
  requestContext,
})
```

**Reference.** `docs-server-request-context.md` (https://mastra.ai/docs/server/request-context).

**Fit.** Good. Put the node id, the inherited criteria, the active rule ids and versions, and the stage name in request context. Durable agents need JSON values.

## RAG and graph RAG `mastra_ref.rag`

**Answer.** `createVectorQueryTool({ vectorStore | vectorStoreName, indexName, model, enableFilter, reranker, databaseConfig, includeSources })` gives an agent a semantic search tool. It returns `relevantContext` and `sources` with `id`, `metadata`, `score`, and `document`. With `enableFilter`, the agent writes a metadata filter. `vectorStore` can be a function of request context.

`createGraphRAGTool()` uses `GraphRAG`, which builds edges between chunks when their embedding similarity passes `threshold`. It then ranks chunks with a random walk. Vector stores include `LibSQLVector`, PgVector, and others. Label: verified (type-checked) for both tools with `LibSQLVector`. Verified (read docs) for the rest.

**Signature.** From `reference-tools-vector-query-tool.md` in `@mastra/rag`:

```typescript
{
  id: string;         // Unique chunk/document identifier
  metadata: any;      // All metadata fields (document ID, etc.)
  vector: number[];   // Embedding vector (if available)
  score: number;      // Similarity score for this retrieval
  document: string;   // Full chunk/document text (if available)
}
```

**Reference.** `reference-tools-vector-query-tool.md` (https://mastra.ai/reference/tools/vector-query-tool), `reference-tools-graph-rag-tool.md` (https://mastra.ai/reference/tools/graph-rag-tool), `reference-rag-graph-rag.md`, `reference-rag-retrieval.md`.

**Fit.** Partial. Embed accepted outputs and research records with metadata such as node id, rule id, rule version, and stage. Then retrieve by meaning and filter by metadata.

The agent writes the filter, so a strict filter, for example "only this node and its parents", must come from our code. `GraphRAG` does not use our category tree. Its edges come from embedding similarity only. Walk the tree in our own database. The workspace search feature (BM25 and hybrid) exists in `docs-sandbox-search.md`. Label: not verified, because that doc was not read.

## Tools `mastra_ref.tools`

**Answer.** `createTool({ id, description, inputSchema, outputSchema, execute, requireApproval, suspendSchema, resumeSchema, requestContextSchema, outputValidation, strict, toModelOutput, inputExamples, background })` makes a tool. `execute(input, context)` receives `context.requestContext`, `context.abortSignal`, `context.agent`, `context.workflow`, and `context.observe`. Approval comes from `requireApproval: true` on the tool or `requireToolApproval` on the call. The agent then emits a `tool-call-approval` chunk and waits. Agent `hooks` run `beforeToolCall` and `afterToolCall`. `@mastra/core/tools` has two web tools:

- `webSearchTool` runs the native web search of the active provider. It supports OpenAI, Anthropic, Google Gemini, and xAI. Another provider fails the run.

- `webFetchTool` fetches one `http` or `https` URL. It blocks private addresses, cuts the text at 100,000 characters, follows at most 5 redirects, and stops after 15 seconds. It returns `isError: true` and does not throw.

`MCPClient` from `@mastra/mcp` connects to MCP servers. `listTools()` returns tools for an agent. Label: verified (type-checked) for `createTool`, `webSearchTool`, and `webFetchTool`. Verified (read docs) for approval and hooks. `MCPClient` is not type-checked, because `@mastra/mcp` is not installed.

**Signature.** From `docs-agents-tools.md`:

```text
| `webSearchTool`    | `<provider.defined>` | Run the active provider's native web search         |
| `webFetchTool`     | `web_fetch`          | Fetch a web page by URL and return its text content |
```

**Reference.** `reference-tools-create-tool.md` (https://mastra.ai/reference/tools/create-tool), `docs-agents-tools.md` (https://mastra.ai/docs/agents/tools), `docs-agents-human-in-the-loop.md` (https://mastra.ai/docs/agents/human-in-the-loop), `reference-tools-mcp-client.md` (https://mastra.ai/reference/tools/mcp-client), `integrations-tools-firecrawl.md`.

**Fit.** Good. Our own research API (for example a deep-research provider) becomes a `createTool` tool. Retrieval of past work becomes a tool over our database. `webSearchTool` ties search to the model provider, so a model change changes the search engine. Use our own search tool when results must stay the same across models.

## Observability `mastra_ref.observability`

**Answer.** Pass `tracingOptions` to `run.start()` or `agent.generate()`. It takes `rootSpanName`, `metadata`, `requestContextKeys`, `traceId`, `parentSpanId`, `nestUnderParent`, and `tags`.

Inside a step, `execute` receives a tracing context with `currentSpan`. A span has `update({ metadata })`, `createChildSpan()`, and `createEventSpan()`. A tool gets `context.observe` for child spans.

`mastra_ref.observability.addFeedback({ traceId, spanId, feedback })` adds a human rating or comment to a stored trace. The storage method `createFeedback` also takes `experimentId` and `tags`. Label: verified (type-checked) for `tracingOptions.metadata` and `tags` on `run.start()`. Verified (read `workflows/step.d.ts`) for the tracing context in a step. Verified (read docs) for spans and feedback.

**Signature.** From `reference-workflows-run-methods-start.md`:

```text
**tracingOptions.metadata** (`Record<string, any>`): Metadata to add to the root trace span. Useful for adding custom attributes like user IDs, session IDs, or feature flags.
**tracingOptions.requestContextKeys** (`string[]`): Additional RequestContext keys to extract as metadata for this trace. ...
**tracingOptions.tags** (`string[]`): Tags to apply to this trace. String labels for categorizing and filtering traces.
```

**Reference.** `reference-observability-tracing-configuration.md`, `reference-observability-tracing-spans.md`, `docs-observability-feedback.md` (https://mastra.ai/docs/observability/feedback), `reference-observability-feedback.md` (https://mastra.ai/reference/observability/feedback).

**Fit.** Good. Put the ruleset version on the root span. Put each rule id and version on the span of its judge step. Reviewer decisions from the approval step can go in as feedback on the same trace. A trace is telemetry, so the rule ids and versions of an accepted output must also go to our own store.

## Skills and workspaces `mastra_ref.skills`

**Answer.** `createSkill({ name, description, instructions, references })` from `@mastra/core/skills` makes a skill in code. An agent takes `skills: [...]` or a function of request context. A skill can also be a path to a folder with a `SKILL.md` file.

The agent gets the tools `skill`, `skill_read`, and `skill_search`, and the model decides when to load a skill. Workspace skills come from the filesystem and serve every agent of the workspace. Agent skills win on a name conflict. Label: verified (type-checked) for `createSkill` and `skills`. Verified (read docs) for the rest.

**Signature.** From `docs-skills.md`:

```typescript
const codeReview = createSkill({
  name: 'code-review',
  description: 'Use when reviewing code changes.',
  instructions: `
    When reviewing code:
    1. Check for correctness and edge cases
  `,
})
```

**Reference.** `docs-skills.md` (https://mastra.ai/docs/skills), `reference-agents-createSkill.md` (https://mastra.ai/reference/agents/createSkill), `docs-sandbox-skills.md` (https://mastra.ai/docs/sandbox/skills).

**Fit.** Weak for strict rules. The model loads a skill only when it chooses to, so a rule can stay unread. Put the rules that a stage must obey in the instructions function. A skill fits optional reference text, for example research methods or golden examples.

## Other relevant parts `mastra_ref.other`

### Eval loop guide `mastra_ref.other.eval_loop`

**Answer.** `docs-guides-build-an-eval-loop.md` shows one loop. It makes a small golden dataset with `groundTruth: { must, mustNot }`. It writes an LLM judge scorer that validates the ground truth with Zod and returns 1 or 0 with a reason.

It runs experiments in Studio and compares them. It adds production traces to the dataset as new items. It runs `runEvals` in CI with `threshold: 1` and requires the verdict `passed`. Label: verified (read docs).

**Signature.** From `docs-guides-build-an-eval-loop.md`:

```typescript
  .analyze({
    description: 'Evaluate the case-specific rubric.',
    outputSchema: z.object({
      passed: z.boolean(),
      reason: z.string(),
    }),
```

**Reference.** `docs-guides-build-an-eval-loop.md` (https://mastra.ai/docs/guides/build-an-eval-loop).

**Fit.** Good template for golden sets and regression checks. It lacks rule versions, the watch-only binding, a promotion step, and any automatic change of prompts or rules. A person or a coding agent makes each fix by hand.

### Predicate language `mastra_ref.other.predicate`

**Answer.** `@mastra/core/predicate` exports `predicateSchema`, `createPredicateEvaluator`, `walk`, `collectInvalidPredicatePaths`, and `derivePredicateLabel`. The predicate language has `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`, `notIn`, `exists`, `notExists`, `truthy`, `falsy`, `and`, `or`, and `not`. Dynamic workflows and scorer filters use the same language. A missing path returns false and does not throw. Label: verified (type-checked) for the evaluator. Verified (read `reference-workflows-dynamic-workflow-definition.md`) for the operators.

**Signature.** From `predicate/index.d.ts`:

```typescript
export declare const predicateSchema: z.ZodType<Predicate>;
export declare function createPredicateEvaluator<TCtx>(resolvePath: PredicatePathResolver<TCtx>): (pred: Predicate, ctx: TCtx) => boolean;
export declare function collectInvalidPredicatePaths(pred: Predicate, roots: readonly string[]): string[];
```

**Reference.** No standalone doc page. See `reference-workflows-dynamic-workflow-definition.md` (https://mastra.ai/reference/workflows/dynamic-workflow-definition).

**Fit.** Good for the rule scope. A rule scope can be a stored predicate over node fields, stage, and output field paths. The same JSON can feed a scorer filter or a dynamic workflow condition. A missing path returns false, so a typo in a scope makes the rule apply nowhere. Run `collectInvalidPredicatePaths` when a rule is saved.

### Parts not read `mastra_ref.other.not_read`

These docs exist but this check did not read them: `docs-evals-vitest-integration.md` in `@mastra/evals`, `docs-sandbox-search.md`, `docs-guides-context-engineering.md`, and `docs-memory-*.md`. Label: not verified.

## Concept map `mastra_ref.map`

| Our concept | Mastra primitive | Import path | Confidence | Gap |
|---|---|---|---|---|
| Stage pipeline | `createWorkflow`, `createStep` | `@mastra/core/workflows` | verified (type-checked) | None |
| Graph level as a sub-pipeline | Nested workflow | `@mastra/core/workflows` | verified (type-checked) | None |
| Research with tools | `Agent`, `createTool`, `webSearchTool`, `webFetchTool` | `@mastra/core/agent`, `@mastra/core/tools` | verified (type-checked) | Web search follows the model provider |
| Research sub-questions | Subagents with delegation hooks | `@mastra/core/agent` | verified (read docs) | None |
| Retrieve past work | `createVectorQueryTool`, `LibSQLVector` | `@mastra/rag`, `@mastra/libsql` | verified (type-checked) | Agent writes the filter |
| Walk the category tree | None | Our database | verified (read docs) | `GraphRAG` ignores our edges |
| Output shape from rules | `structuredOutput.schema` | `generate()` option | verified (type-checked) | No retry on schema failure |
| Deterministic rule check | `createScorer` with function steps | `@mastra/core/evals` | verified (type-checked) | Number only, no verdict |
| LLM rule judge | `createScorer` with judge, or `Classifier` choice | `@mastra/core/evals`, `@mastra/core/classifier` | verified (type-checked) | No reason from a classifier |
| `cannot_verify` verdict | `notScorable` (partial) | `@mastra/core/evals` | verified (type-checked) | Means not applicable, dropped in live scoring |
| Strict binding, repair | `abort(msg, { retry: true })`, `maxProcessorRetries` | `@mastra/core/processors` | verified (type-checked) | Context grows each retry |
| Repair loop in code steps | `.dountil()` with `iterationCount` | `@mastra/core/workflows` | verified (type-checked) | None |
| Soft binding | Processor `warn` strategy, `onViolation` | `@mastra/core/processors` | verified (read docs) | We must store the warning (inferred) |
| Watch-only binding | Live scorers with `sampling` | Agent or step `scorers` | verified (read docs) | No verdict field on the score row |
| Loop until all rules pass | `goal.scorer` or `isTaskComplete` | `@mastra/core/agent` | verified (type-checked) | One number for all rules |
| Budget | `maxRuns`, `maxSteps`, `timeout.totalMs`, `TokenCostControl` | `@mastra/core/agent`, `@mastra/core/processors` | verified (type-checked) | Cost check is approximate |
| Human approval | `suspend`, `resume`, `bail` | `@mastra/core/workflows` | verified (type-checked) | None |
| Accept into graph store | None | Our database, shared libSQL client or Postgres | verified (type-checked) | No custom storage domain |
| Rule ids on stored output | Workflow state, `tracingOptions.metadata` | `@mastra/core/workflows` | verified (type-checked) | Must persist in our store |
| Rule text versions | Prompt blocks, stored scorer definitions | `@mastra/editor` | verified (read docs) | No structured fields, silent drop |
| Rule scope | Predicate language | `@mastra/core/predicate` | verified (type-checked) | Missing path returns false |
| Node context | `RequestContext` | `@mastra/core/request-context` | verified (type-checked) | None |
| Golden examples per rule | Datasets with versions | `mastra_ref.datasets` | verified (type-checked) | None |
| Candidate vs current version | Experiments, `grouping`, `compareExperiments` | `mastra_ref.datasets` | verified (type-checked) | No delta, no promotion gate |
| Batch gate in CI | `runEvals` gates and thresholds | `@mastra/core/evals` | verified (type-checked) | Batch only |
| Ruleset compiled to a workflow | `addDynamicWorkflow`, `addWorkflow` | `@mastra/core/mastra` | verified (type-checked) | Beta, registered parts only |
| Nightly shadow run | Schedules | `mastra_ref.schedules` | verified (read docs) | Needs schedules domain |
| Human review signal | `addFeedback` | `mastra_ref.observability` | verified (read docs) | None |
| Self-improvement | None | Not available | verified (read docs) | No optimizer |

## Look Before You Build `mastra_ref.look_before_you_build`

These maintained packages can cover the gaps above. Label for each link and status: not verified in this check, because the check used no network access.

| Gap | Package | Link |
|---|---|---|
| Validate rule-defined JSON shapes stored as data | Ajv | https://ajv.js.org |
| Rule scope or policy rules beyond the predicate language | json-rules-engine | https://github.com/CacheControl/json-rules-engine |
| Same, as a portable JSON format | JSON Logic | https://jsonlogic.com |
| Same, as a policy engine | Open Policy Agent | https://www.openpolicyagent.org |
| Same, as a typed policy language | Cedar | https://www.cedarpolicy.com |
| Category tree in Postgres | `ltree` extension | https://www.postgresql.org/docs/current/ltree.html |
| Typed tables for nodes, rules, records | Drizzle ORM | https://orm.drizzle.team |
| Same, as a query builder | Kysely | https://kysely.dev |
| Statistics for candidate vs current | simple-statistics | https://simple-statistics.github.io |
| Prompt and rule optimizer in TypeScript | Ax | https://github.com/ax-llm/ax |
| Prompt optimizer in Python | DSPy | https://dspy.ai |
| Prompt regression tests | promptfoo | https://www.promptfoo.dev |

The verdict record (`pass`, `fail`, `cannot_verify`, with reason and evidence) has no package. Build it as our own type and table. The reason is that Mastra scores are numbers and no package found in this check fits the three-way verdict.
