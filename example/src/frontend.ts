import myReactSinglePageApp from "./index.html";

const server = Bun.serve({
  routes: {
    "/": myReactSinglePageApp,
  },
  port: 3200,
});

console.log(`Server is running on ${server.url}`);
