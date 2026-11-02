import { markUiCopy } from "@/lib/i18n";
import { Providers, providerLogoMap } from "@/components/provider_info_helpers";
import { guardrailLogoMap } from "./guardrail_info_helpers";

export interface GuardrailCardInfo {
  id: string;
  name: string;
  description: string;
  category: "litellm" | "decision_model" | "partner";
  subcategory?: string;
  logo: string;
  tags: string[];
  eval?: {
    f1: number;
    precision: number;
    recall: number;
    testCases: number;
    latency: string;
  };
  providerKey?: string;
}

const litellmContentFilterLogo = guardrailLogoMap["LiteLLM Content Filter"];

export const LITELLM_CONTENT_FILTER_CARDS: GuardrailCardInfo[] = [
  markUiCopy(
    {
      id: "cf_denied_financial",
      name: "Denied Financial Advice",
      description:
        "Detects requests for personalized financial advice, investment recommendations, or financial planning.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Topic Blocker"],
      eval: {
        f1: 100.0,
        precision: 100.0,
        recall: 100.0,
        testCases: 207,
        latency: "<0.1ms",
      },
    },
    {
      description:
        "Detects requests for personalized financial advice, investment recommendations, or financial planning.",
    },
  ),
  markUiCopy(
    {
      id: "cf_denied_insults",
      name: "Insults & Personal Attacks",
      description:
        "Detects insults, name-calling, and personal attacks directed at the chatbot, staff, or other people.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Topic Blocker"],
      eval: {
        f1: 100.0,
        precision: 100.0,
        recall: 100.0,
        testCases: 299,
        latency: "<0.1ms",
      },
    },
    {
      description:
        "Detects insults, name-calling, and personal attacks directed at the chatbot, staff, or other people.",
    },
  ),
  markUiCopy(
    {
      id: "cf_denied_legal",
      name: "Denied Legal Advice",
      description: "Detects requests for unauthorized legal advice, case analysis, or legal recommendations.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Topic Blocker"],
    },
    { description: "Detects requests for unauthorized legal advice, case analysis, or legal recommendations." },
  ),
  markUiCopy(
    {
      id: "cf_denied_medical",
      name: "Denied Medical Advice",
      description: "Detects requests for medical diagnosis, treatment recommendations, or health advice.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Topic Blocker"],
    },
    { description: "Detects requests for medical diagnosis, treatment recommendations, or health advice." },
  ),
  markUiCopy(
    {
      id: "cf_harmful_violence",
      name: "Harmful Violence",
      description: "Detects content related to violence, criminal planning, attacks, and violent threats.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Safety"],
    },
    { description: "Detects content related to violence, criminal planning, attacks, and violent threats." },
  ),
  markUiCopy(
    {
      id: "cf_harmful_self_harm",
      name: "Harmful Self-Harm",
      description: "Detects content related to self-harm, suicide, and dangerous self-destructive behavior.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Safety"],
    },
    { description: "Detects content related to self-harm, suicide, and dangerous self-destructive behavior." },
  ),
  markUiCopy(
    {
      id: "cf_harmful_child_safety",
      name: "Harmful Child Safety",
      description: "Detects content that could endanger child safety or exploit minors.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Safety"],
    },
    { description: "Detects content that could endanger child safety or exploit minors." },
  ),
  markUiCopy(
    {
      id: "cf_harmful_illegal_weapons",
      name: "Harmful Illegal Weapons",
      description: "Detects content related to illegal weapons manufacturing, distribution, or acquisition.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Safety"],
    },
    { description: "Detects content related to illegal weapons manufacturing, distribution, or acquisition." },
  ),
  markUiCopy(
    {
      id: "cf_bias_gender",
      name: "Bias: Gender",
      description: "Detects gender-based discrimination, stereotypes, and biased language.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Bias"],
    },
    { description: "Detects gender-based discrimination, stereotypes, and biased language." },
  ),
  markUiCopy(
    {
      id: "cf_bias_racial",
      name: "Bias: Racial",
      description: "Detects racial discrimination, stereotypes, and racially biased content.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Bias"],
    },
    { description: "Detects racial discrimination, stereotypes, and racially biased content." },
  ),
  markUiCopy(
    {
      id: "cf_bias_religious",
      name: "Bias: Religious",
      description: "Detects religious discrimination, intolerance, and religiously biased content.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Bias"],
    },
    { description: "Detects religious discrimination, intolerance, and religiously biased content." },
  ),
  markUiCopy(
    {
      id: "cf_bias_sexual_orientation",
      name: "Bias: Sexual Orientation",
      description: "Detects discrimination based on sexual orientation and related biased content.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Bias"],
    },
    { description: "Detects discrimination based on sexual orientation and related biased content." },
  ),
  markUiCopy(
    {
      id: "cf_prompt_injection_jailbreak",
      name: "Prompt Injection: Jailbreak",
      description: "Detects jailbreak attempts designed to bypass AI safety guidelines and restrictions.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Prompt Injection"],
    },
    { description: "Detects jailbreak attempts designed to bypass AI safety guidelines and restrictions." },
  ),
  markUiCopy(
    {
      id: "cf_prompt_injection_data_exfil",
      name: "Prompt Injection: Data Exfiltration",
      description: "Detects attempts to extract sensitive data through prompt manipulation.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Prompt Injection"],
    },
    { description: "Detects attempts to extract sensitive data through prompt manipulation." },
  ),
  markUiCopy(
    {
      id: "cf_prompt_injection_sql",
      name: "Prompt Injection: SQL",
      description: "Detects SQL injection attempts embedded in prompts.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Prompt Injection"],
    },
    { description: "Detects SQL injection attempts embedded in prompts." },
  ),
  markUiCopy(
    {
      id: "cf_prompt_injection_malicious_code",
      name: "Prompt Injection: Malicious Code",
      description: "Detects attempts to inject malicious code through prompts.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Prompt Injection"],
    },
    { description: "Detects attempts to inject malicious code through prompts." },
  ),
  markUiCopy(
    {
      id: "cf_prompt_injection_system_prompt",
      name: "Prompt Injection: System Prompt",
      description: "Detects attempts to extract or override system prompts.",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Prompt Injection"],
    },
    { description: "Detects attempts to extract or override system prompts." },
  ),
  markUiCopy(
    {
      id: "cf_toxic_abuse",
      name: "Toxic & Abusive Language",
      description: "Detects toxic, abusive, and hateful language across multiple languages (EN, AU, DE, ES, FR).",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Toxicity"],
    },
    { description: "Detects toxic, abusive, and hateful language across multiple languages (EN, AU, DE, ES, FR)." },
  ),
  markUiCopy(
    {
      id: "cf_patterns",
      name: "Pattern Matching",
      description:
        "Detect and block sensitive data patterns like SSNs, credit card numbers, API keys, and custom regex patterns.",
      category: "litellm",
      subcategory: "Patterns",
      logo: litellmContentFilterLogo,
      tags: ["PII", "Regex", "Data Protection"],
    },
    {
      description:
        "Detect and block sensitive data patterns like SSNs, credit card numbers, API keys, and custom regex patterns.",
    },
  ),
  markUiCopy(
    {
      id: "cf_keywords",
      name: "Keyword Blocking",
      description:
        "Block or mask content containing specific keywords or phrases. Upload custom word lists or add individual terms.",
      category: "litellm",
      subcategory: "Keywords",
      logo: litellmContentFilterLogo,
      tags: ["Keywords", "Blocklist"],
    },
    {
      description:
        "Block or mask content containing specific keywords or phrases. Upload custom word lists or add individual terms.",
    },
  ),
  markUiCopy(
    {
      id: "block_code_execution",
      name: "Block Code Execution",
      description:
        "Detects markdown fenced code blocks in requests and responses. Block or mask executable code (e.g. Python, JavaScript, Bash) by language with configurable confidence.",
      category: "litellm",
      subcategory: "Code Safety",
      logo: litellmContentFilterLogo,
      tags: ["Code", "Safety", "Prompt Injection"],
    },
    {
      description:
        "Detects markdown fenced code blocks in requests and responses. Block or mask executable code (e.g. Python, JavaScript, Bash) by language with configurable confidence.",
    },
  ),
  markUiCopy(
    {
      id: "cf_competitor_intent",
      name: "Competitor Name Blocking",
      description:
        "Block or reframe competitor comparison and ranking intent. Detect when users ask to compare or recommend competitors (airline or generic competitor lists).",
      category: "litellm",
      subcategory: "Content Category",
      logo: litellmContentFilterLogo,
      tags: ["Content Category", "Competitor", "Topic Blocker"],
    },
    {
      description:
        "Block or reframe competitor comparison and ranking intent. Detect when users ask to compare or recommend competitors (airline or generic competitor lists).",
    },
  ),
];

export const DECISION_MODEL_CARDS: GuardrailCardInfo[] = [
  markUiCopy(
    {
      id: "dm_typesafe_jev",
      name: "TypeSafe Jev",
      description:
        "TypeSafe's Jev decision model answers your yes/no questions about each request, such as prompt injection or policy checks.",
      category: "decision_model",
      logo: providerLogoMap[Providers.TypeSafe] ?? "",
      tags: ["Decision Model", "TypeSafe", "Prompt Injection"],
      providerKey: "DecisionModel",
    },
    {
      description:
        "TypeSafe's Jev decision model answers your yes/no questions about each request, such as prompt injection or policy checks.",
    },
  ),
  markUiCopy(
    {
      id: "dm_perplexity",
      name: "Perplexity Decision",
      description: "Perplexity's pplx-decider model answers your yes/no questions about each request or response.",
      category: "decision_model",
      logo: providerLogoMap[Providers.Perplexity] ?? "",
      tags: ["Decision Model", "Perplexity"],
      providerKey: "DecisionModel",
    },
    { description: "Perplexity's pplx-decider model answers your yes/no questions about each request or response." },
  ),
  markUiCopy(
    {
      id: "dm_microsoft",
      name: "Microsoft Decision Model",
      description:
        "Microsoft Foundry decision models, such as Microsoft-Decision-1, answer your yes/no questions about each request or response.",
      category: "decision_model",
      logo: providerLogoMap[Providers.Azure_AI_Studio] ?? "",
      tags: ["Decision Model", "Microsoft"],
      providerKey: "DecisionModel",
    },
    {
      description:
        "Microsoft Foundry decision models, such as Microsoft-Decision-1, answer your yes/no questions about each request or response.",
    },
  ),
  markUiCopy(
    {
      id: "dm_openai",
      name: "OpenAI Decision Model",
      description:
        "OpenAI decision models, such as gpt-6-luna, answer your yes/no questions about each request or response.",
      category: "decision_model",
      logo: providerLogoMap[Providers.OpenAI] ?? "",
      tags: ["Decision Model", "OpenAI"],
      providerKey: "DecisionModel",
    },
    {
      description:
        "OpenAI decision models, such as gpt-6-luna, answer your yes/no questions about each request or response.",
    },
  ),
  markUiCopy(
    {
      id: "dm_databricks",
      name: "Databricks Decision Model",
      description:
        "Decision models served on Databricks, such as OpenJev, answer your yes/no questions about each request or response.",
      category: "decision_model",
      logo: providerLogoMap[Providers.Databricks] ?? "",
      tags: ["Decision Model", "Databricks"],
      providerKey: "DecisionModel",
    },
    {
      description:
        "Decision models served on Databricks, such as OpenJev, answer your yes/no questions about each request or response.",
    },
  ),
];

export const PARTNER_GUARDRAIL_CARDS: GuardrailCardInfo[] = [
  markUiCopy(
    {
      id: "presidio",
      name: "Presidio PII",
      description:
        "Microsoft Presidio for PII detection and anonymization. Supports 30+ entity types with configurable actions.",
      category: "partner",
      logo: guardrailLogoMap["Presidio PII"],
      tags: ["PII", "Microsoft"],
      providerKey: "PresidioPII",
    },
    {
      description:
        "Microsoft Presidio for PII detection and anonymization. Supports 30+ entity types with configurable actions.",
    },
  ),
  markUiCopy(
    {
      id: "bedrock",
      name: "Bedrock Guardrail",
      description:
        "AWS Bedrock Guardrails for content filtering, topic avoidance, and sensitive information detection.",
      category: "partner",
      logo: guardrailLogoMap["Bedrock Guardrail"],
      tags: ["AWS", "Content Safety"],
      providerKey: "Bedrock",
    },
    {
      description:
        "AWS Bedrock Guardrails for content filtering, topic avoidance, and sensitive information detection.",
    },
  ),
  markUiCopy(
    {
      id: "lakera",
      name: "Lakera",
      description: "AI security platform protecting against prompt injections, data leakage, and harmful content.",
      category: "partner",
      logo: guardrailLogoMap["Lakera"],
      tags: ["Security", "Prompt Injection"],
      providerKey: "Lakera",
    },
    { description: "AI security platform protecting against prompt injections, data leakage, and harmful content." },
  ),
  markUiCopy(
    {
      id: "openai_moderation",
      name: "OpenAI Moderation",
      description: "OpenAI's content moderation API for detecting harmful content across multiple categories.",
      category: "partner",
      logo: guardrailLogoMap["OpenAI Moderation"],
      tags: ["Content Moderation", "OpenAI"],
    },
    { description: "OpenAI's content moderation API for detecting harmful content across multiple categories." },
  ),
  markUiCopy(
    {
      id: "google_model_armor",
      name: "Google Cloud Model Armor",
      description: "Google Cloud's model protection service for safe and responsible AI deployments.",
      category: "partner",
      logo: guardrailLogoMap["Google Cloud Model Armor"],
      tags: ["Google Cloud", "Safety"],
    },
    { description: "Google Cloud's model protection service for safe and responsible AI deployments." },
  ),
  markUiCopy(
    {
      id: "guardrails_ai",
      name: "Guardrails AI",
      description: "Open-source framework for adding structural, type, and quality guarantees to LLM outputs.",
      category: "partner",
      logo: guardrailLogoMap["Guardrails AI"],
      tags: ["Open Source", "Validation"],
    },
    { description: "Open-source framework for adding structural, type, and quality guarantees to LLM outputs." },
  ),
  markUiCopy(
    {
      id: "zscaler",
      name: "Zscaler AI Guard",
      description: "Enterprise AI security from Zscaler for monitoring and protecting AI/ML workloads.",
      category: "partner",
      logo: guardrailLogoMap["Zscaler AI Guard"],
      tags: ["Enterprise", "Security"],
    },
    { description: "Enterprise AI security from Zscaler for monitoring and protecting AI/ML workloads." },
  ),
  markUiCopy(
    {
      id: "panw",
      name: "PANW Prisma AIRS",
      description: "Palo Alto Networks Prisma AI Runtime Security for securing AI applications in production.",
      category: "partner",
      logo: guardrailLogoMap["PANW Prisma AIRS"],
      tags: ["Enterprise", "Security"],
    },
    { description: "Palo Alto Networks Prisma AI Runtime Security for securing AI applications in production." },
  ),
  markUiCopy(
    {
      id: "cisco_ai_defense",
      name: "Cisco AI Defense",
      description:
        "Cisco AI Defense Inspection API for runtime protection: prompt injection, PII/PCI/PHI, harassment, hate speech, profanity, violence, and code detection.",
      category: "partner",
      logo: guardrailLogoMap["Cisco AI Defense"],
      tags: ["Enterprise", "Security", "Prompt Injection", "PII"],
      providerKey: "CiscoAiDefense",
    },
    {
      description:
        "Cisco AI Defense Inspection API for runtime protection: prompt injection, PII/PCI/PHI, harassment, hate speech, profanity, violence, and code detection.",
    },
  ),
  markUiCopy(
    {
      id: "noma",
      name: "Noma Security",
      description: "AI security platform for detecting and preventing AI-specific threats and vulnerabilities.",
      category: "partner",
      logo: guardrailLogoMap["Noma Security"],
      tags: ["Security", "Threat Detection"],
    },
    { description: "AI security platform for detecting and preventing AI-specific threats and vulnerabilities." },
  ),
  markUiCopy(
    {
      id: "aporia",
      name: "Aporia AI",
      description: "Real-time AI guardrails for hallucination detection, topic control, and policy enforcement.",
      category: "partner",
      logo: guardrailLogoMap["Aporia AI"],
      tags: ["Hallucination", "Policy"],
    },
    { description: "Real-time AI guardrails for hallucination detection, topic control, and policy enforcement." },
  ),
  markUiCopy(
    {
      id: "aim",
      name: "AIM Guardrail",
      description: "AIM Security guardrails for comprehensive AI threat detection and mitigation.",
      category: "partner",
      logo: guardrailLogoMap["AIM Guardrail"],
      tags: ["Security", "Threat Detection"],
    },
    { description: "AIM Security guardrails for comprehensive AI threat detection and mitigation." },
  ),
  markUiCopy(
    {
      id: "cato_networks",
      name: "Cato Networks Guardrail",
      description: "Cato Networks guardrails for comprehensive AI threat detection and mitigation.",
      category: "partner",
      logo: guardrailLogoMap["Cato Networks Guardrail"],
      tags: ["Security", "Threat Detection"],
    },
    { description: "Cato Networks guardrails for comprehensive AI threat detection and mitigation." },
  ),
  markUiCopy(
    {
      id: "prompt_security",
      name: "Prompt Security",
      description: "Protect against prompt injection attacks, data leakage, and other LLM security threats.",
      category: "partner",
      logo: guardrailLogoMap["Prompt Security"],
      tags: ["Prompt Injection", "Security"],
    },
    { description: "Protect against prompt injection attacks, data leakage, and other LLM security threats." },
  ),
  markUiCopy(
    {
      id: "lasso",
      name: "Lasso Guardrail",
      description: "Content moderation and safety guardrails for responsible AI deployments.",
      category: "partner",
      logo: guardrailLogoMap["Lasso Guardrail"],
      tags: ["Content Moderation"],
    },
    { description: "Content moderation and safety guardrails for responsible AI deployments." },
  ),
  markUiCopy(
    {
      id: "pangea",
      name: "Pangea Guardrail",
      description: "Pangea's AI guardrails for secure, compliant, and trustworthy AI applications.",
      category: "partner",
      logo: guardrailLogoMap["Pangea Guardrail"],
      tags: ["Compliance", "Security"],
    },
    { description: "Pangea's AI guardrails for secure, compliant, and trustworthy AI applications." },
  ),
  markUiCopy(
    {
      id: "enkryptai",
      name: "EnkryptAI",
      description: "AI security and governance platform for enterprise AI safety and compliance.",
      category: "partner",
      logo: guardrailLogoMap["EnkryptAI"],
      tags: ["Enterprise", "Governance"],
    },
    { description: "AI security and governance platform for enterprise AI safety and compliance." },
  ),
  markUiCopy(
    {
      id: "javelin",
      name: "Javelin Guardrails",
      description: "AI gateway with built-in guardrails for secure and compliant AI operations.",
      category: "partner",
      logo: guardrailLogoMap["Javelin Guardrails"],
      tags: ["Gateway", "Security"],
    },
    { description: "AI gateway with built-in guardrails for secure and compliant AI operations." },
  ),
  markUiCopy(
    {
      id: "pillar",
      name: "Pillar Guardrail",
      description: "AI safety platform for monitoring, testing, and securing AI systems.",
      category: "partner",
      logo: guardrailLogoMap["Pillar Guardrail"],
      tags: ["Monitoring", "Safety"],
    },
    { description: "AI safety platform for monitoring, testing, and securing AI systems." },
  ),
  markUiCopy(
    {
      id: "akto",
      name: "Akto Guardrail",
      description: "AI security platform from Akto.io with automatic monitoring and guardrails for AI/ML applications.",
      category: "partner",
      logo: guardrailLogoMap["Akto"],
      tags: ["Security", "Safety", "Monitoring"],
    },
    {
      description: "AI security platform from Akto.io with automatic monitoring and guardrails for AI/ML applications.",
    },
  ),
  markUiCopy(
    {
      id: "promptguard",
      name: "PromptGuard",
      description:
        "AI security gateway with prompt injection detection, PII redaction, topic filtering, entity blocklists, and hallucination detection. Self-hostable with drop-in proxy integration.",
      category: "partner",
      logo: guardrailLogoMap["PromptGuard"],
      tags: ["Security", "Prompt Injection", "PII"],
      providerKey: "Promptguard",
      eval: {
        f1: 94.9,
        precision: 100.0,
        recall: 90.4,
        testCases: 5384,
        latency: "~150ms",
      },
    },
    {
      description:
        "AI security gateway with prompt injection detection, PII redaction, topic filtering, entity blocklists, and hallucination detection. Self-hostable with drop-in proxy integration.",
    },
  ),
  markUiCopy(
    {
      id: "xecguard",
      name: "XecGuard",
      description:
        "CyCraft XecGuard AI security gateway. Multi-policy scanning (prompt injection, harmful content, PII, system-prompt enforcement) plus RAG context grounding.",
      category: "partner",
      logo: guardrailLogoMap["XecGuard"],
      tags: ["Security", "Policy", "Grounding", "RAG"],
      providerKey: "Xecguard",
    },
    {
      description:
        "CyCraft XecGuard AI security gateway. Multi-policy scanning (prompt injection, harmful content, PII, system-prompt enforcement) plus RAG context grounding.",
    },
  ),
  markUiCopy(
    {
      id: "deepkeep",
      name: "DeepKeep AI Firewall",
      description:
        "DeepKeep AI Firewall for comprehensive LLM security — prompt injection detection, PII protection, content moderation, and policy enforcement with configurable guardrail pipelines.",
      category: "partner",
      logo: guardrailLogoMap["DeepKeep AI Firewall"],
      tags: ["Security", "Prompt Injection", "PII", "Firewall"],
      providerKey: "Deepkeep",
    },
    {
      description:
        "DeepKeep AI Firewall for comprehensive LLM security — prompt injection detection, PII protection, content moderation, and policy enforcement with configurable guardrail pipelines.",
    },
  ),
  markUiCopy(
    {
      id: "repelloai",
      name: "RepelloAI Argus",
      description:
        "RepelloAI Argus scans prompts and responses against policies configured per asset in the Repello dashboard.",
      category: "partner",
      logo: guardrailLogoMap["RepelloAI Argus"],
      tags: ["Security", "Policy", "Prompt Injection"],
      providerKey: "Repelloai",
    },
    {
      description:
        "RepelloAI Argus scans prompts and responses against policies configured per asset in the Repello dashboard.",
    },
  ),
  markUiCopy(
    {
      id: "straiker",
      name: "Straiker",
      description:
        "Defend AI Agentic Guardrails: Indirect/Direct Prompt Injection, Tool Misuse, Malicious MCP and Skills",
      category: "partner",
      logo: guardrailLogoMap["Straiker"],
      tags: ["Agentic", "Prompt Injection", "Tool Misuse", "MCP", "Skills"],
      providerKey: "Straiker",
    },
    {
      description:
        "Defend AI Agentic Guardrails: Indirect/Direct Prompt Injection, Tool Misuse, Malicious MCP and Skills",
    },
  ),
  markUiCopy(
    {
      id: "alice",
      name: "Alice",
      description:
        "Policy-based guardrails for prompts and model responses, evaluated per application so one proxy can enforce a different policy set per team or product.",
      category: "partner",
      logo: guardrailLogoMap["Alice"],
      tags: ["Content Moderation", "Prompt Injection", "PII", "Policy"],
      providerKey: "Alice",
    },
    {
      description:
        "Policy-based guardrails for prompts and model responses, evaluated per application so one proxy can enforce a different policy set per team or product.",
    },
  ),
  markUiCopy(
    {
      id: "agent_365",
      name: "Microsoft Agent 365",
      description:
        "Microsoft Agent 365 tool-call governance: Defender threat evaluation and observability for MCP tool calls, acting on behalf of the signed-in user",
      category: "partner",
      logo: guardrailLogoMap["Microsoft Agent 365"],
      tags: ["Agentic", "MCP", "Tool Misuse", "Observability"],
      providerKey: "Agent365",
    },
    {
      description:
        "Microsoft Agent 365 tool-call governance: Defender threat evaluation and observability for MCP tool calls, acting on behalf of the signed-in user",
    },
  ),
  markUiCopy(
    {
      id: "llm_shield_proxy",
      name: "LLM Shield Proxy",
      description:
        "Self-hosted PII redaction that puts the original values back into the model's response, so the provider never receives personal data while the end user still sees it.",
      category: "partner",
      logo: guardrailLogoMap["LLM Shield Proxy"],
      tags: ["PII", "Data Privacy", "Compliance", "Streaming"],
      providerKey: "LLM Shield Proxy",
    },
    {
      description:
        "Self-hosted PII redaction that puts the original values back into the model's response, so the provider never receives personal data while the end user still sees it.",
    },
  ),
  markUiCopy(
    {
      id: "conduct",
      name: "Conduct Guard",
      description:
        "Conduct Guard evaluates prompts against workspace rules before the model call: prompt injection, PII, and custom policies, with block, warning, and approval verdicts.",
      category: "partner",
      logo: guardrailLogoMap["Conduct Guard"],
      tags: ["Security", "Prompt Injection", "PII", "Policy"],
      providerKey: "Conduct",
    },
    {
      description:
        "Conduct Guard evaluates prompts against workspace rules before the model call: prompt injection, PII, and custom policies, with block, warning, and approval verdicts.",
    },
  ),
];

export const ALL_CARDS = [...LITELLM_CONTENT_FILTER_CARDS, ...DECISION_MODEL_CARDS, ...PARTNER_GUARDRAIL_CARDS];
