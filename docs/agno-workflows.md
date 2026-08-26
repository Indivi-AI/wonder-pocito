# Agno Workflows: how they work and how to define them

Research date: 2026-08-25. Sources are limited to Agno's official documentation.

## Mental model

An Agno `Workflow` is a controlled pipeline that orchestrates `Agent`, `Team`, Python functions, or nested workflows. Its control flow is explicit and
repeatable; model-generated content can still vary between runs. Each `Step` wraps exactly one executor, and the output of a completed step becomes input for
the next step. This differs from a `Team`, where model-driven members delegate dynamically.

Use a workflow when execution order, branches, loops, parallel groups, or an audit trail matter. Use a team when the collaboration path should be chosen
dynamically by the models.

Sources: [Workflow overview](https://docs.agno.com/workflows/overview),
[Workflow patterns](https://docs.agno.com/workflows/workflow-patterns/overview).

## Minimal definition

```python
from agno.agent import Agent
from agno.workflow import Workflow

researcher = Agent(name="Researcher", instructions="Research the requested topic")
writer = Agent(name="Writer", instructions="Write a concise answer from the research")

workflow = Workflow(name="Research and write", steps=[researcher, writer])
workflow.print_response("Explain vector databases", stream=True)
```

The items in `steps` run sequentially by default. `Agent`, `Team`, functions, and nested `Workflow` objects can be placed directly in the list; use an explicit
`Step` when the step needs its own name, description, executor configuration, or human-review behavior.

Source: [Workflow overview and first example](https://docs.agno.com/workflows/overview).

## Explicit steps and data flow

```python
from agno.workflow import Step, StepInput, StepOutput, Workflow

def normalize(step_input: StepInput) -> StepOutput:
    return StepOutput(content=(step_input.previous_step_content or "").strip())

workflow = Workflow(
    name="Explicit pipeline",
    steps=[
        Step(name="research", agent=researcher),
        Step(name="normalize", executor=normalize),
        Step(name="write", agent=writer),
    ],
)

result = workflow.run("Explain vector databases")
```

A custom function receives `StepInput` and returns `StepOutput`. It can read:

- `input`: the original workflow input.
- `previous_step_content`: the immediately preceding output.
- `previous_step_outputs`: all earlier outputs keyed by step name.
- `get_step_content(name)` or `get_step_output(name)`: a named earlier result, including nested steps.
- `additional_data` and accumulated media/files.

Sources: [Building workflows](https://docs.agno.com/workflows/building-workflows),
[StepInput reference](https://docs.agno.com/reference/workflows/step_input),
[Custom function steps](https://docs.agno.com/workflows/workflow-patterns/custom-function-step-workflow).

## Control-flow building blocks

| Component | Meaning | Main configuration |
| --- | --- | --- |
| `Steps` | A named, reusable sequential group | `steps=[...]` |
| `Parallel` | Runs independent steps concurrently and joins their outputs | child steps |
| `Condition` | Runs `steps` or `else_steps` | `evaluator` |
| `Loop` | Repeats steps until a condition or iteration limit | `end_condition`, `max_iterations` |
| `Router` | Selects one or more paths dynamically | `selector`, `choices` |

These constructs can be nested. Evaluators/selectors may be Python callables; Agno Studio also supports serializable CEL expressions for this logic.

Sources: [Building workflows](https://docs.agno.com/workflows/building-workflows),
[Advanced workflow composition](https://docs.agno.com/workflows/workflow-patterns/advanced-workflow-patterns),
[Studio workflows and CEL](https://docs.agno.com/agent-os/studio/workflows).

## Running, persistence, and state

- `run()` executes synchronously and `arun()` asynchronously.
- `stream=True` streams content; `stream_events=True` also emits intermediate workflow events.
- `print_response()` and `aprint_response()` are convenient terminal renderers.
- Add `db=...` to persist runs and sessions. `session_id` groups runs; `session_state` persists between them and is available to functions through `RunContext`.
- `input_schema` can validate workflow input with a Pydantic model.
- Human-in-the-loop pause/resume requires a database. Resolve the paused requirements, then call `continue_run()` or `acontinue_run()`.
- The `steps` parameter may also be a callable or a `Steps` object, not only a list, for function-based or grouped workflows.

Sources: [Workflow API reference](https://docs.agno.com/reference/workflows/workflow),
[Running workflows](https://docs.agno.com/workflows/running-workflows),
[Workflow sessions](https://docs.agno.com/sessions/workflow-sessions),
[Workflow session state](https://docs.agno.com/state/workflows/overview),
[Human-in-the-loop workflows](https://docs.agno.com/workflows/hitl/overview).

## Practical definition checklist

1. Define focused agents/teams and any transformation functions.
2. Put them in `Workflow(steps=[...])` in the required order.
3. Introduce explicit `Step` objects when names or custom behavior matter.
4. Compose `Parallel`, `Condition`, `Loop`, `Router`, or `Steps` only where the business flow requires them.
5. Add a database and stable session identifiers when history, state, auditability, or run resumption is required.
6. Execute with `run`/`arun`; enable streaming and event storage only when the caller needs them.
