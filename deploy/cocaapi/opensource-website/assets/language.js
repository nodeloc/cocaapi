const english = Object.freeze({
  pageTitle: "CocaAPI | Open-source model infrastructure",
  description:
    "CocaAPI, an open-source model gateway and user service extension built on LiteLLM. Unified model access, self-hosting, keys, usage tracking and wallet billing",
  socialDescription:
    "One gateway for your models, applications and users. Built on LiteLLM and hosted on your infrastructure",
  skip: "Skip to content",
  home: "CocaAPI home",
  navigation: "Main navigation",
  navFeatures: "Features",
  quickstart: "Quick start",
  navHost: "Self-host",
  navCommunity: "Community",
  docs: "Docs",
  deploy: "Get started",
  announcement:
    '<span class="status-dot"></span>Built on LiteLLM <span class="announcement-tail">About the project <span aria-hidden="true">↗</span></span>',
  heroHeading:
    'Open-source<br>model infrastructure<span class="heading-dot">.</span>',
  heroDescription:
    "Connect model providers through one API. Manage keys, usage and user services in one place. CocaAPI extends LiteLLM and runs on your own infrastructure",
  heroNote: "Self-hosted · OpenAI-compatible · Source available",
  terminalDemo: "Workflow illustration",
  providersLabel: "Model providers",
  providersIntro: "Bring your own keys for",
  providerMarquee: "Model providers. Hover or focus to pause scrolling",
  providersLink: 'Explore provider adapters <span aria-hidden="true">↗</span>',
  featuresHeading: "From model calls<br>to user services",
  featuresDescription:
    "LiteLLM gateway capabilities, extended with a user console and wallet billing. Separate entry points for applications, administrators and users",
  apiHeading: "One API, many models",
  apiDescription:
    "Keep the OpenAI SDK and call configured providers through model aliases. Use gateway endpoints for chat, streaming and more",
  routingHeading: "Routing, retries & fallbacks",
  routingDescription:
    "Configure load balancing, retries and fallback models with LiteLLM Router. Reach your model deployments through a shared entry point",
  keysHeading: "Keys & model access",
  keysDescription:
    "Issue virtual keys with model allowlists, rate limits and budgets. Users only see data they are authorized to access",
  usageHeading: "Usage & request logs",
  usageDescription:
    "Track tokens, cost, success rates and latency. Filter by time and model to inspect real requests from personal keys",
  accountsHeading: "A separate user console",
  accountsDescription:
    "Accounts, personal keys, a model catalog and Playground. User services and the admin dashboard have separate permission boundaries",
  walletHeading: "Wallets & redemption codes",
  walletDescription:
    "Balances, redemption codes, request reservations and actual-cost settlement. Payment gateway interfaces require a separate provider integration",
  startHeading: "Start with a local deployment",
  deploymentGuide: 'Full deployment guide <span aria-hidden="true">↗</span>',
  runGateway: "Run the base gateway",
  copy: "Copy",
  copyDeploy: "Copy deployment commands",
  deployNote:
    "For local deployment on Linux with Docker Compose and Python 3. For public hosting, set PROXY_BASE_URL to your HTTPS domain. Wait for the initial health checks to pass",
  addKeys: "Add a provider and a key",
  loginInstructions:
    "Open <code>http://localhost:4000/ui/</code> and sign in with the administrator credentials from the generated <code>.env</code> file",
  providerInstructions:
    "Add an authorized provider and its upstream key. Set a model alias such as <code>my-model</code>, then create a virtual key for your application",
  setupModels: "Configure model",
  setupAccess: "Grant access",
  setupKey: "Create key",
  providerNote:
    "The initial model list is empty. Providers charge for upstream API calls. Use virtual keys in applications",
  requestHeading: "Send your first request",
  exampleLanguages: "API example languages",
  copyApi: "Copy API example",
  requestNote:
    "Set your virtual key as <code>COCAAPI_API_KEY</code> and replace <code>my-model</code> with your configured model alias. For Python or Node.js, install the corresponding <code>openai</code> SDK first",
  extensionNote:
    'Need accounts and wallets? Beyond the base gateway, follow the <a href="https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/AUTH.md">account extension</a> and <a href="https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/deploy/cocaapi/WALLET.md">billing extension</a> guides to build the extension image, configure <code>auth.env</code> and use <code>compose.auth.yaml</code>',
  hostHeading: "Your server<br>Your model gateway",
  architectureApps: "Web & mobile applications",
  architectureAgents: "Agents & workflows",
  architectureTools: "OpenAI SDKs & developer tools",
  architectureRouting: "Model routing",
  architectureKeys: "Keys & limits",
  architectureLogs: "Logs & usage",
  architectureWallet: "Users & wallets*",
  extensionRequired: "* Requires the CocaAPI extension image",
  localModels: "Cloud services & local models",
  architectureNote:
    "You manage the keys, database and gateway. Remote model requests are sent to the upstream providers you configure",
  dashboardHeading: "Every request<br>leaves a trace",
  dashboardDescription:
    "Configure models, keys and routing in the admin dashboard. With the user extension, users can inspect their own usage, logs and balance in a separate console",
  consoleUsage: "Usage & cost charts",
  consoleKeys: "Personal keys & model catalog",
  consoleLogs: "Request logs & latency",
  consolePlayground: "Playground for API testing",
  consoleGuide:
    'Read the user console guide <span aria-hidden="true">↗</span>',
  dashboardLabel: "User console layout illustration with sample data",
  dashboardUsage: "Usage",
  dashboardLogs: "Logs",
  dashboardKeys: "Keys",
  sampleData: "Sample data",
  usageOverview: "Usage overview",
  lastWeek: "Last 7 days",
  requests: "Requests",
  spend: "Spend / USD",
  communityHeading: "Read the code. Help build it",
  communityIntro:
    "An issue, a documentation fix or a new provider adapter<br>Every improvement can start in the repository",
  sourceHeading: "Explore the source",
  sourceDescription:
    "Understand the gateway and its extensions. Run and modify them in your own environment",
  issuesHeading: "Share issues & ideas",
  issuesDescription:
    "Include reproduction steps and sanitized logs to help others investigate",
  issuesAction: 'Open issues <span aria-hidden="true">↗</span>',
  contributeHeading: "Contribute an improvement",
  contributeDescription:
    "Read the contributing guide and open a pull request for code, tests or documentation",
  contributeAction: 'Contributing guide <span aria-hidden="true">↗</span>',
  docsHeading: "Where to go next",
  docsIntro: "Find the guide that matches your deployment",
  deploymentTitle: "Base deployment",
  deploymentDescription: "Compose, credentials, health checks & backups",
  authTitle: "Accounts & authentication",
  authDescription: "User extension, sessions, email & OAuth configuration",
  billingTitle: "Wallets & API billing",
  billingDescription:
    "Redemption codes, settlement & payment integration boundaries",
  gatewayTitle: "User API gateway",
  gatewayDescription:
    "Personal keys, model catalog, Playground & log permissions",
  faqHeading: "Before you deploy<br>Good to know",
  faqRelationship: "How does CocaAPI relate to LiteLLM?",
  faqRelationshipAnswer:
    "CocaAPI extends LiteLLM with user accounts, wallets, redemption codes and personal gateway pages. LiteLLM provides the unified model API, routing and admin dashboard. The source is available in this project repository",
  faqLicense: "What is the open-source license?",
  faqLicenseAnswer:
    'The repository LICENSE places content outside the enterprise directory under the MIT license. The enterprise directory has a separate license. Read the <a href="https://github.com/nodeloc/cocaapi/blob/litellm_account_auth/LICENSE">full LICENSE</a> before using, modifying or distributing the software',
  faqModels: "Can I call every model after deploying?",
  faqModelsAnswer:
    "First configure authorized upstream services, models and API keys. The base deployment starts with an empty model list. An administrator must grant model access and budgets for virtual keys. Providers charge under their own terms",
  faqServices: "Are accounts, email and payments ready to use?",
  faqServicesAnswer:
    "The user console and wallets require a built and deployed extension image. Email and third-party sign-in require service credentials. USDT payments still need a concrete payment adapter and should not be treated as an enabled payment service",
  faqData: "Where does data go when I self-host?",
  faqDataAnswer:
    "The gateway and storage run on your server. Remote model requests go to the providers you configure. Set up log retention, access controls and local models according to your deployment requirements",
  closingHeading:
    "Make model access simpler<br><span>Keep your infrastructure yours</span>",
  closingDeploy: 'Start self-hosting <span aria-hidden="true">↗</span>',
  closingSource: 'View source on GitHub <span aria-hidden="true">↗</span>',
  closingNote: "Built on LiteLLM · Extended with CocaAPI user services",
  footerIntro:
    "Open-source model infrastructure<br>Built on your own infrastructure",
  footerProject: "Project",
  footerCommits: "Commit history",
  footerLicense: "License",
  footerArchitecture: "Architecture & deployment",
  footerExtensions: "Extension guides",
  footerCommunity: "Community",
  footerIssues: "Report an issue",
  footerContributing: "Contributing guide",
  footerSecurity: "Security policy",
  footerCredit: "/ Models and trademarks belong to their respective owners",
  themeLabel: "Theme",
  systemTheme: "System theme",
  lightTheme: "Light theme",
  darkTheme: "Dark theme",
  copySuccess: "Copied to clipboard",
  copyFallback: "Please copy the selected code manually",
  openMenu: "Open navigation",
  closeMenu: "Close navigation",
});

const messages = Object.freeze({
  copySuccess: "已复制到剪贴板",
  copyFallback: "请手动复制已选中的代码",
  openMenu: "打开导航",
  closeMenu: "关闭导航",
});

const bindings = Object.freeze([
  ...Array.from(document.querySelectorAll("[data-i18n]"), (element) => ({
    element,
    key: element.dataset.i18n,
    attribute: null,
    original: element.innerHTML,
  })),
  ...Array.from(document.querySelectorAll("[data-i18n-label]"), (element) => ({
    element,
    key: element.dataset.i18nLabel,
    attribute: "aria-label",
    original: element.getAttribute("aria-label"),
  })),
  ...Array.from(
    document.querySelectorAll("[data-i18n-content]"),
    (element) => ({
      element,
      key: element.dataset.i18nContent,
      attribute: "content",
      original: element.getAttribute("content"),
    }),
  ),
]);
const buttons = document.querySelectorAll("[data-locale]");
const applyLanguage = (language) => {
  document.documentElement.lang = language;
  bindings.forEach(({ element, key, attribute, original }) => {
    const value = language === "en" ? english[key] : original;
    if (attribute) {
      element.setAttribute(attribute, value);
      return;
    }
    element.innerHTML = value;
  });
  buttons.forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.locale === language),
    );
  });
  document.dispatchEvent(new Event("cocaapi:languagechange"));
};
const savedLanguage = () => {
  try {
    return localStorage.getItem("cocaapi-opensource-language") === "en"
      ? "en"
      : "zh-CN";
  } catch {
    return "zh-CN";
  }
};

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const language = button.dataset.locale === "en" ? "en" : "zh-CN";
    applyLanguage(language);
    try {
      localStorage.setItem("cocaapi-opensource-language", language);
    } catch {}
  });
});
applyLanguage(savedLanguage());

export const translate = (key) =>
  document.documentElement.lang === "en" ? english[key] : messages[key];
