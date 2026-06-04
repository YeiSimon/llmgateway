"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/lib/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/lib/components/tabs";
import { toast } from "@/lib/components/use-toast";
import { useAppConfig } from "@/lib/config";

const PLACEHOLDER_KEY = "YOUR_LLMGATEWAY_API_KEY";

function CodeBlock({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		void navigator.clipboard.writeText(code);
		setCopied(true);
		toast({ title: "Copied to clipboard." });
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="relative rounded-md bg-muted overflow-hidden">
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="absolute top-2 right-2 h-7 w-7"
				onClick={handleCopy}
			>
				{copied ? (
					<Check className="h-3.5 w-3.5 text-green-600" />
				) : (
					<Copy className="h-3.5 w-3.5" />
				)}
			</Button>
			<pre className="p-4 pr-12 text-sm font-mono overflow-x-auto whitespace-pre">
				{code}
			</pre>
		</div>
	);
}

export function GuideClient() {
	const config = useAppConfig();
	const gw = config.gatewayUrl;

	const snippets = {
		"claude-code": `claude --api-url ${gw} --api-key ${PLACEHOLDER_KEY}`,
		cursor: `// In Cursor settings (settings.json):
{
  "openai.apiBase": "${gw}/v1",
  "openai.apiKey": "${PLACEHOLDER_KEY}"
}`,
		continue: `// In Continue config (~/.continue/config.json):
{
  "models": [
    {
      "title": "LLM Gateway",
      "provider": "openai",
      "model": "gpt-4o",
      "apiBase": "${gw}/v1",
      "apiKey": "${PLACEHOLDER_KEY}"
    }
  ]
}`,
		cline: `// In Cline settings:
// API Provider: OpenAI Compatible
// Base URL: ${gw}/v1
// API Key: ${PLACEHOLDER_KEY}`,
		"openai-sdk": `import openai

client = openai.OpenAI(
    base_url="${gw}/v1",
    api_key="${PLACEHOLDER_KEY}",
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`,
		"anthropic-sdk": `import anthropic

# LLM Gateway is OpenAI-compatible; use the openai package or httpx:
import openai

client = openai.OpenAI(
    base_url="${gw}/v1",
    api_key="${PLACEHOLDER_KEY}",
)

response = client.chat.completions.create(
    model="claude-3-5-sonnet-20241022",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`,
		curl: `curl ${gw}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${PLACEHOLDER_KEY}" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
	};

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
				<div className="max-w-4xl mx-auto space-y-4">
					<div>
						<h2 className="text-3xl font-bold tracking-tight">
							Configuration Guide
						</h2>
						<p className="text-muted-foreground mt-1">
							Connect your tools to LLM Gateway using the snippets below.
							Replace{" "}
							<code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
								{PLACEHOLDER_KEY}
							</code>{" "}
							with an API key from your project.
						</p>
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Gateway URL</CardTitle>
							<CardDescription>
								Your gateway endpoint for all LLM requests.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<CodeBlock code={gw} />
						</CardContent>
					</Card>

					<Tabs defaultValue="claude-code">
						<TabsList className="flex flex-wrap h-auto gap-1">
							<TabsTrigger value="claude-code">Claude Code</TabsTrigger>
							<TabsTrigger value="cursor">Cursor</TabsTrigger>
							<TabsTrigger value="continue">Continue</TabsTrigger>
							<TabsTrigger value="cline">Cline</TabsTrigger>
							<TabsTrigger value="openai-sdk">OpenAI SDK</TabsTrigger>
							<TabsTrigger value="anthropic-sdk">Anthropic SDK</TabsTrigger>
							<TabsTrigger value="curl">cURL</TabsTrigger>
						</TabsList>

						<TabsContent value="claude-code">
							<Card>
								<CardHeader>
									<CardTitle>Claude Code</CardTitle>
									<CardDescription>
										Use LLM Gateway as the API backend for Claude Code CLI.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<CodeBlock code={snippets["claude-code"]} />
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="cursor">
							<Card>
								<CardHeader>
									<CardTitle>Cursor</CardTitle>
									<CardDescription>
										Configure Cursor to use LLM Gateway as the OpenAI-compatible
										backend.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<CodeBlock code={snippets.cursor} />
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="continue">
							<Card>
								<CardHeader>
									<CardTitle>Continue</CardTitle>
									<CardDescription>
										Add LLM Gateway as a model provider in Continue.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<CodeBlock code={snippets.continue} />
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="cline">
							<Card>
								<CardHeader>
									<CardTitle>Cline</CardTitle>
									<CardDescription>
										Configure Cline to route through LLM Gateway.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<CodeBlock code={snippets.cline} />
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="openai-sdk">
							<Card>
								<CardHeader>
									<CardTitle>OpenAI SDK (Python)</CardTitle>
									<CardDescription>
										Use the OpenAI Python SDK with LLM Gateway as the base URL.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<CodeBlock code={snippets["openai-sdk"]} />
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="anthropic-sdk">
							<Card>
								<CardHeader>
									<CardTitle>Anthropic SDK</CardTitle>
									<CardDescription>
										LLM Gateway is OpenAI-compatible — use the OpenAI client to
										route Anthropic model requests.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<CodeBlock code={snippets["anthropic-sdk"]} />
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="curl">
							<Card>
								<CardHeader>
									<CardTitle>cURL</CardTitle>
									<CardDescription>
										Send requests directly with cURL for quick testing.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<CodeBlock code={snippets.curl} />
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	);
}
