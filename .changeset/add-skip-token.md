---
"@spiko-tech/effect-react-query": minor
---

Add `skipToken` support for conditional query execution

- Re-export `skipToken` from `@tanstack/react-query` for convenience
- All hooks (`useEffectQuery`, `useInfiniteEffectQuery`, `useEffectQueries`) now accept `skipToken` as `queryFn`
- `toQueryOptions` and `effectQueryOptions` support `skipToken` for use with `useQuery` directly
- When using `skipToken`, the `runtime` option is not required (typed as `never`)

This enables the idiomatic TanStack Query pattern for conditional queries:

```ts
const { data } = useEffectQuery({
  queryKey: ["user", userId],
  queryFn: userId ? () => Effect.succeed({ id: userId }) : skipToken,
});
```
