---
"@spiko-tech/effect-react-query": major
---

Migrate to Effect v4. The `runtime` option now accepts a `Context.Context<R>` or a `ManagedRuntime` (v3 `Runtime.Runtime<R>` no longer exists). Cancellation now uses Effect's native `signal` run option.
