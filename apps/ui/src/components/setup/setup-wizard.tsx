"use client";

import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/lib/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import { Step, Stepper } from "@/lib/components/stepper";
import { toast } from "@/lib/components/use-toast";
import { useAppConfig } from "@/lib/config";
import { useApi } from "@/lib/fetch-client";

const STEPS = [
	{
		id: "org",
		title: "Create Organization",
		description:
			"Your organization is the top-level container for all projects.",
	},
	{
		id: "provider",
		title: "Add Provider Key",
		description: "Connect your LLM provider API key to start routing requests.",
	},
	{
		id: "project",
		title: "Create Project & API Key",
		description: "Create your first project and a gateway API key.",
	},
	{
		id: "sso",
		title: "Set Up SSO",
		description: "Configure single sign-on for your team.",
		optional: true,
		customNextText: "Skip",
	},
	{
		id: "ready",
		title: "You're Ready!",
		description: "Your gateway is configured and ready to use.",
	},
];

interface SetupWizardProps {
	orgId: string;
	orgName: string;
}

type ProviderChoice = "openai" | "anthropic" | "google";

export function SetupWizard({ orgId, orgName }: SetupWizardProps) {
	const config = useAppConfig();
	const api = useApi();

	const [activeStep, setActiveStep] = useState(0);

	const [selectedProvider, setSelectedProvider] =
		useState<ProviderChoice | null>(null);
	const [providerApiKey, setProviderApiKey] = useState("");
	const [isAddingProvider, setIsAddingProvider] = useState(false);

	const [projectName, setProjectName] = useState("");
	const [apiKeyName, setApiKeyName] = useState("My First Key");
	const [isCreatingProject, setIsCreatingProject] = useState(false);
	const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

	const createProjectMutation = api.useMutation("post", "/projects");
	const createApiKeyMutation = api.useMutation("post", "/keys/api");
	const createProviderKeyMutation = api.useMutation("post", "/keys/provider");

	const gatewayUrl = config.gatewayUrl;

	const handleAddProvider = async () => {
		if (!selectedProvider || !providerApiKey) {
			toast({
				title: "Missing information",
				description: "Please select a provider and enter your API key.",
				variant: "destructive",
			});
			return;
		}
		setIsAddingProvider(true);
		try {
			await createProviderKeyMutation.mutateAsync({
				body: {
					provider: selectedProvider,
					token: providerApiKey,
					organizationId: orgId,
				},
			});
			toast({ title: "Provider key added successfully." });
			setActiveStep(2);
		} catch {
			toast({
				title: "Failed to add provider key.",
				variant: "destructive",
			});
		} finally {
			setIsAddingProvider(false);
		}
	};

	const handleCreateProject = async () => {
		if (!projectName) {
			toast({
				title: "Project name required",
				variant: "destructive",
			});
			return;
		}
		setIsCreatingProject(true);
		try {
			const projectResult = await createProjectMutation.mutateAsync({
				body: { name: projectName, organizationId: orgId },
			});
			const project = projectResult.project;
			setCreatedProjectId(project.id);
			await createApiKeyMutation.mutateAsync({
				body: {
					description: apiKeyName,
					projectId: project.id,
				},
			});
			toast({ title: "Project and API key created." });
			setActiveStep(3);
		} catch {
			toast({
				title: "Failed to create project or API key.",
				variant: "destructive",
			});
		} finally {
			setIsCreatingProject(false);
		}
	};

	const handleCopy = (text: string) => {
		void navigator.clipboard.writeText(text);
		toast({ title: "Copied to clipboard." });
	};

	const PROVIDER_OPTIONS: { id: ProviderChoice; label: string }[] = [
		{ id: "openai", label: "OpenAI" },
		{ id: "anthropic", label: "Anthropic" },
		{ id: "google", label: "Google" },
	];

	return (
		<div className="min-h-screen flex flex-col items-center justify-start px-4 py-12 bg-background">
			<div className="w-full max-w-2xl space-y-8">
				<div className="text-center space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">
						Welcome to LLM Gateway
					</h1>
					<p className="text-muted-foreground">
						Complete these steps to get up and running in minutes.
					</p>
				</div>

				<Stepper
					steps={STEPS}
					activeStep={activeStep}
					onStepChange={setActiveStep}
					nextButtonDisabled={activeStep === STEPS.length - 1}
				>
					{activeStep === 0 && (
						<Step>
							<Card>
								<CardHeader>
									<CardTitle>Your Organization</CardTitle>
									<CardDescription>
										Your organization is already set up and ready to use.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="space-y-2">
										<Label>Organization Name</Label>
										<Input value={orgName} readOnly className="bg-muted" />
										<p className="text-xs text-muted-foreground">
											You can rename your organization in organization settings.
										</p>
									</div>
									<div className="mt-4 flex items-center gap-2 text-sm text-green-600">
										<Check className="h-4 w-4" />
										Organization created
									</div>
								</CardContent>
							</Card>
						</Step>
					)}

					{activeStep === 1 && (
						<Step>
							<Card>
								<CardHeader>
									<CardTitle>Add Your First Provider Key</CardTitle>
									<CardDescription>
										Choose your LLM provider and enter your API key. LLM Gateway
										will route requests through it.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="space-y-2">
										<Label>Provider</Label>
										<div className="flex gap-2 flex-wrap">
											{PROVIDER_OPTIONS.map((p) => (
												<Button
													key={p.id}
													type="button"
													variant={
														selectedProvider === p.id ? "default" : "outline"
													}
													onClick={() => setSelectedProvider(p.id)}
												>
													{p.label}
												</Button>
											))}
										</div>
									</div>
									{selectedProvider && (
										<div className="space-y-2">
											<Label htmlFor="provider-key">
												{selectedProvider === "openai"
													? "OpenAI"
													: selectedProvider === "anthropic"
														? "Anthropic"
														: "Google"}{" "}
												API Key
											</Label>
											<Input
												id="provider-key"
												type="password"
												placeholder="sk-..."
												value={providerApiKey}
												onChange={(e) => setProviderApiKey(e.target.value)}
											/>
										</div>
									)}
									<Button
										onClick={handleAddProvider}
										disabled={
											isAddingProvider || !selectedProvider || !providerApiKey
										}
									>
										{isAddingProvider ? "Adding..." : "Test & Continue"}
									</Button>
								</CardContent>
							</Card>
						</Step>
					)}

					{activeStep === 2 && (
						<Step>
							<Card>
								<CardHeader>
									<CardTitle>Create Your First Project & API Key</CardTitle>
									<CardDescription>
										Projects group API keys and usage tracking together.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor="project-name">Project Name</Label>
										<Input
											id="project-name"
											placeholder="My Project"
											value={projectName}
											onChange={(e) => setProjectName(e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="api-key-name">API Key Name</Label>
										<Input
											id="api-key-name"
											placeholder="My First Key"
											value={apiKeyName}
											onChange={(e) => setApiKeyName(e.target.value)}
										/>
									</div>
									{!createdProjectId && (
										<Button
											onClick={handleCreateProject}
											disabled={isCreatingProject || !projectName}
										>
											{isCreatingProject ? "Creating..." : "Create"}
										</Button>
									)}
									{createdProjectId && (
										<div className="flex items-center gap-2 text-sm text-green-600">
											<Check className="h-4 w-4" />
											Project and API key created
										</div>
									)}
								</CardContent>
							</Card>
						</Step>
					)}

					{activeStep === 3 && (
						<Step>
							<Card>
								<CardHeader>
									<CardTitle>Set Up SSO (Optional)</CardTitle>
									<CardDescription>
										Configure single sign-on so your team can log in with your
										identity provider.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<p className="text-sm text-muted-foreground">
										SSO allows your team members to authenticate via OIDC, SAML,
										Google, Microsoft, Okta, or GitHub.
									</p>
									<Button variant="outline" asChild>
										<Link href={`/dashboard/${orgId}/org/sso`}>
											Configure OIDC / SSO
										</Link>
									</Button>
								</CardContent>
							</Card>
						</Step>
					)}

					{activeStep === 4 && (
						<Step>
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Check className="h-5 w-5 text-green-600" />
										You&apos;re ready!
									</CardTitle>
									<CardDescription>
										Your LLM Gateway is configured. Start routing requests using
										the snippets below.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="space-y-2">
										<Label>Gateway URL</Label>
										<div className="flex gap-2">
											<Input
												value={gatewayUrl}
												readOnly
												className="font-mono text-sm bg-muted"
											/>
											<Button
												variant="outline"
												size="icon"
												onClick={() => handleCopy(gatewayUrl)}
											>
												<Copy className="h-4 w-4" />
											</Button>
										</div>
									</div>

									<div className="space-y-2">
										<Label>Claude Code</Label>
										<div className="flex gap-2">
											<pre className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono overflow-x-auto">
												{`claude --api-url ${gatewayUrl}`}
											</pre>
											<Button
												variant="outline"
												size="icon"
												onClick={() =>
													handleCopy(`claude --api-url ${gatewayUrl}`)
												}
											>
												<Copy className="h-4 w-4" />
											</Button>
										</div>
									</div>

									<div className="space-y-2">
										<Label>OpenAI SDK (Python)</Label>
										<div className="flex gap-2">
											<pre className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre">
												{`import openai
client = openai.OpenAI(
    base_url="${gatewayUrl}/v1",
    api_key="YOUR_LLMGATEWAY_API_KEY",
)`}
											</pre>
											<Button
												variant="outline"
												size="icon"
												onClick={() =>
													handleCopy(
														`import openai\nclient = openai.OpenAI(\n    base_url="${gatewayUrl}/v1",\n    api_key="YOUR_LLMGATEWAY_API_KEY",\n)`,
													)
												}
											>
												<Copy className="h-4 w-4" />
											</Button>
										</div>
									</div>

									<p className="text-xs text-muted-foreground">
										Replace{" "}
										<code className="bg-muted px-1 rounded">
											YOUR_LLMGATEWAY_API_KEY
										</code>{" "}
										with an API key from your project settings.
									</p>

									<Button asChild>
										<Link href={`/dashboard/${orgId}`}>Go to Dashboard</Link>
									</Button>
								</CardContent>
							</Card>
						</Step>
					)}
				</Stepper>
			</div>
		</div>
	);
}
