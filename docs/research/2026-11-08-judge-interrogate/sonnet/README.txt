Base: detached a8f71fb. node_modules symlinked from main checkout.
Apply: scorers.patch (spec quote check + RUNTIME_VERSION 2 + answer-format line); step.ts.prototype -> src/judge/step.ts (literal judge.order + judge.bindings); p*.test.ts -> tests/interrogate/.
Run: npx vitest run tests/interrogate/pN.test.ts   (p0 holds helpers)
