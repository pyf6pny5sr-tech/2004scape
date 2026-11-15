import http from "node:http";
export function tool(socket, request) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: socket,
        path: "/tool",
        method: "POST",
        timeout: 12000,
        headers: { "content-type": "application/json" },
      },
      (res) => {
        let text = "";
        res.on("data", (b) => {
          text += b;
          if (text.length > 4000000)
            req.destroy(new Error("RESPONSE_TOO_LARGE"));
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(text);
            if (res.statusCode !== 200)
              reject(new Error(data.reason ?? data.error));
            else resolve(data.result);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("BRIDGE_TIMEOUT")));
    req.end(JSON.stringify(request));
  });
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    console.log(
      JSON.stringify(
        await tool(
          process.env.WARTIME_V2_SOCKET,
          JSON.parse(process.argv[2] ?? '{"operation":"status"}'),
        ),
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }));
    process.exitCode = 1;
  }
}
