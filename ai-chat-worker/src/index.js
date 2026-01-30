export default {
	async fetch(request, env) {
	  try {
		if (request.method !== "POST") {
		  return new Response("Use POST", { status: 405 });
		}
  
		const body = await request.json();
  
		let messages;
  
		if (Array.isArray(body.messages)) {
		  messages = body.messages;
		} else if (typeof body.input === "string") {
		  messages = [{ role: "user", content: body.input }];
		} else {
		  return new Response(
			JSON.stringify({ error: "Missing input or messages" }),
			{ status: 400 }
		  );
		}
  
		const result = await env.AI.run(
		  "@cf/meta/llama-3-8b-instruct",
		  {
			messages
		  }
		);
  
		return new Response(
		  JSON.stringify({
			content:
			  result?.response ??
			  result?.output_text ??
			  result?.output?.[0]?.content?.[0]?.text ??
			  "No response"
		  }),
		  { headers: { "Content-Type": "application/json" } }
		);
	  } catch (err) {
		return new Response(
		  JSON.stringify({
			error: "Internal error",
			details: String(err)
		  }),
		  { status: 500 }
		);
	  }
	}
  };
  