import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const copyFields = new Set([
  "title",
  "label",
  "header",
  "groupLabel",
  "description",
  "message",
  "placeholder",
  "noDataMessage",
  "emptyText",
  "tooltip",
  "helperText",
  "loadingText",
]);
const attributes = new Set([
  ...copyFields,
  "aria-label",
  "alt",
  "children",
  "confirmText",
  "cancelText",
  "buttonText",
  "loadingMessage",
  "emptyMessage",
  "searchPlaceholder",
]);
const notifications = new Set([
  "error",
  "success",
  "warning",
  "warn",
  "info",
  "loading",
  "setError",
  "setMessage",
  "setSuccess",
]);
const codeTags =
  /^(?:pre|code|script|style|CodeBlock|CodeSnippet|SyntaxHighlighter|ReactMarkdown|Markdown|Editor|JsonViewer)$/;
const normalize = (value) => value.replace(/\s+/g, " ").trim();
const isCopy = (value) =>
  /[a-zA-Z\u4e00-\u9fff]/.test(value) &&
  !/^(?:https?:\/\/|\/[\w/]|sk-|#[\da-f]+$|["'][\w-]+["']\s*:|\s*[{\[])/i.test(value) &&
  !/^[\w./:-]*[_/][\w./:-]*$/.test(value);
const decodedText = new Map();

function jsxText(value) {
  if (decodedText.has(value)) return decodedText.get(value);
  const output = ts.transpileModule(`const item = <span>${value}</span>;`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const file = ts.createSourceFile("jsx.js", output, ts.ScriptTarget.Latest, true);
  let result = "";
  const walk = (node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === "children" && ts.isStringLiteral(node.initializer))
      result = node.initializer.text;
    ts.forEachChild(node, walk);
  };
  walk(file);
  decodedText.set(value, result);
  return result;
}

function nameOf(node, file) {
  return node.name && ts.isStringLiteral(node.name) ? node.name.text : node.name?.getText(file);
}

function schemaOrCode(node, file) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent)) {
      if (codeTags.test(parent.openingElement.tagName.getText(file))) return true;
      if (
        parent.openingElement.attributes.properties.some(
          (item) =>
            ts.isJsxAttribute(item) &&
            nameOf(item, file) === "className" &&
            item.initializer &&
            ts.isStringLiteral(item.initializer) &&
            /font-mono/.test(item.initializer.text),
        )
      )
        return true;
    }
    if (ts.isJsxSelfClosingElement(parent) && parent.tagName.getText(file) === "LocalizedText") return true;
    if (
      ts.isObjectLiteralExpression(parent) &&
      parent.properties.some(
        (item) =>
          ts.isPropertyAssignment(item) && ["type", "properties", "required", "$schema"].includes(nameOf(item, file)),
      )
    )
      return true;
  }
  return false;
}

function displayed(node, file) {
  for (let current = node; current.parent; current = current.parent) {
    const parent = current.parent;
    if (
      (ts.isJsxOpeningElement(parent) || ts.isJsxClosingElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
      parent.tagName.pos <= node.pos &&
      parent.tagName.end >= node.end
    )
      return false;
    if (ts.isJsxAttribute(parent) && parent.name.pos <= node.pos && parent.name.end >= node.end) return false;
    if (ts.isJsxExpression(parent) || ts.isFunctionLike(parent) || ts.isBlock(parent)) break;
  }
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isCallExpression(parent) &&
      /^(?:translateMessage|localizedProperty|markUiCopy)$/.test(parent.expression.getText(file))
    )
      return false;
    if (ts.isJsxExpression(parent))
      return ts.isJsxAttribute(parent.parent)
        ? attributes.has(nameOf(parent.parent, file))
        : ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent);
    if (ts.isCallExpression(parent)) {
      const called = ts.isPropertyAccessExpression(parent.expression)
        ? parent.expression.name.text
        : parent.expression.getText(file);
      if (parent.expression.getText(file).startsWith("console.")) return false;
      if (notifications.has(called))
        return parent.arguments[0]?.pos <= node.pos && parent.arguments[0]?.end >= node.end;
      if (["toUpperCase", "toLowerCase", "trim"].includes(called)) continue;
      return false;
    }
    if (
      ts.isElementAccessExpression(parent) ||
      ts.isArrayLiteralExpression(parent) ||
      ts.isBindingElement(parent) ||
      ts.isParameter(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isFunctionLike(parent) ||
      ts.isBlock(parent) ||
      ts.isPropertyAssignment(parent)
    )
      return false;
    if (ts.isConditionalExpression(parent) && parent.condition.pos <= node.pos && parent.condition.end >= node.end)
      return false;
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      parent.left.pos <= node.pos &&
      parent.left.end >= node.end
    )
      return false;
    if (
      ts.isBinaryExpression(parent) &&
      ![
        ts.SyntaxKind.PlusToken,
        ts.SyntaxKind.QuestionQuestionToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.AmpersandAmpersandToken,
      ].includes(parent.operatorToken.kind)
    )
      return false;
  }
  return false;
}

function scopeOf(node) {
  for (let parent = node.parent; parent; parent = parent.parent)
    if (ts.isBlock(parent) || ts.isFunctionLike(parent) || ts.isSourceFile(parent)) return parent;
  return node.getSourceFile();
}

function functionName(node, file) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isVariableDeclaration(node.parent)) return node.parent.name.getText(file);
  if (
    ts.isCallExpression(node.parent) &&
    /(?:memo|forwardRef)$/.test(node.parent.expression.getText(file)) &&
    ts.isVariableDeclaration(node.parent.parent)
  )
    return node.parent.parent.name.getText(file);
  return "";
}

export function localizeSource(source, filename) {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const already = /from ["']@\/lib\/i18n["']/.test(source);
  const edits = [];
  const messages = new Set();
  const imports = new Set();
  const bindings = new Map();
  const prefixes = new Map();
  const functions = [];
  const memos = [];
  const presentationEdits = [];
  let ownerNumber = 0;
  const add = (start, end, text, priority = 0) => edits.push({ start, end, text, priority });
  const replace = (node, text) => {
    add(node.getStart(file), node.end, text);
    presentationEdits.push(node);
  };
  const message = (value) => {
    messages.add(normalize(value));
    return JSON.stringify(value);
  };
  const prefix = (node, text) => prefixes.set(node, [...(prefixes.get(node) ?? []), text]);
  const bind = (scope, name, value) => {
    if (!bindings.has(scope)) bindings.set(scope, new Map());
    bindings.get(scope).set(name, value);
  };
  const resolve = (node, identifier) => {
    for (let current = node.parent; current; current = current.parent)
      if (bindings.get(current)?.has(identifier)) return bindings.get(current).get(identifier);
    return undefined;
  };
  const bindPattern = (pattern, scope, owner) => {
    if (ts.isIdentifier(pattern)) {
      bind(scope, pattern.text, null);
      return;
    }
    if (!ts.isObjectBindingPattern(pattern)) return;
    for (const part of pattern.elements) {
      if (!ts.isIdentifier(part.name)) continue;
      const field = part.propertyName ? nameOf({ name: part.propertyName }, file) : part.name.text;
      bind(scope, part.name.text, owner && !part.dotDotDotToken && copyFields.has(field) ? { owner, field } : null);
    }
  };
  const reference = (node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && copyFields.has(node.name.text))
      return { owner: node.expression.getText(file), field: JSON.stringify(node.name.text) };
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /(?:labels|messages|errors|reasons|kinds|titles|descriptions)$/i.test(node.expression.text) &&
      node.argumentExpression &&
      (ts.isIdentifier(node.argumentExpression) ||
        ts.isStringLiteral(node.argumentExpression) ||
        ts.isNumericLiteral(node.argumentExpression))
    )
      return { owner: node.expression.getText(file), field: node.argumentExpression.getText(file) };
    if (ts.isIdentifier(node)) {
      const binding = resolve(node, node.text);
      if (binding) return { owner: binding.owner, field: binding.fieldExpression ?? JSON.stringify(binding.field) };
    }
    return undefined;
  };
  const collect = (node) => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      functions.push(node);
      for (const parameter of node.parameters) {
        if (
          !already &&
          node.body &&
          !node.parameters.some((part) => part.initializer) &&
          ts.isObjectBindingPattern(parameter.name) &&
          !parameter.name.elements.some(
            (part) => part.initializer || (part.propertyName && ts.isComputedPropertyName(part.propertyName)),
          ) &&
          parameter.name.elements.some((part) =>
            copyFields.has(part.propertyName ? nameOf({ name: part.propertyName }, file) : part.name.getText(file)),
          )
        ) {
          const owner = `cocaCopyProps${ownerNumber++}`;
          bindPattern(parameter.name, node, owner);
          add(parameter.name.getStart(file), parameter.name.end, owner);
          prefix(node, `const ${parameter.name.getText(file)} = ${owner};`);
        } else bindPattern(parameter.name, node, undefined);
      }
    }
    if (ts.isVariableDeclaration(node)) {
      const scope = scopeOf(node);
      bindPattern(
        node.name,
        scope,
        ts.isObjectBindingPattern(node.name) && node.initializer && ts.isIdentifier(node.initializer)
          ? node.initializer.text
          : undefined,
      );
      if (
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isVariableDeclarationList(node.parent) &&
        node.parent.flags & ts.NodeFlags.Const
      ) {
        const alias = reference(node.initializer);
        if (alias) bind(scope, node.name.text, { owner: alias.owner, fieldExpression: alias.field });
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(file);
  const annotate = (object) => {
    const fields = [];
    const inherited = [];
    for (const property of object.properties) {
      if (ts.isSpreadAssignment(property) && ts.isIdentifier(property.expression))
        inherited.push(property.expression.text);
      const key = nameOf(property, file);
      const annotationKey = (() => {
        if (!property.name || !ts.isComputedPropertyName(property.name)) return JSON.stringify(key);
        const expression = property.name.expression;
        if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression) || ts.isStringLiteral(expression))
          return `[${expression.getText(file)}]`;
        return undefined;
      })();
      const mapped = (() => {
        for (let current = object.parent; current; current = current.parent) {
          if (ts.isVariableDeclaration(current))
            return /(?:labels|messages|errors|reasons|kinds|titles|descriptions)$/i.test(current.name.getText(file));
          if (ts.isFunctionLike(current)) return false;
        }
        return false;
      })();
      if (!key || !annotationKey || (!copyFields.has(key) && !mapped)) continue;
      const shorthand = ts.isShorthandPropertyAssignment(property) ? property.name : undefined;
      const initializer = ts.isPropertyAssignment(property) ? property.initializer : shorthand;
      if (!initializer) continue;
      if (
        (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) &&
        isCopy(initializer.text)
      )
        fields.push(`${annotationKey}: ${message(initializer.text)}`);
      else if (
        ts.isConditionalExpression(initializer) &&
        ts.isStringLiteral(initializer.whenTrue) &&
        ts.isStringLiteral(initializer.whenFalse) &&
        isCopy(initializer.whenTrue.text) &&
        isCopy(initializer.whenFalse.text)
      )
        fields.push(
          `${annotationKey}: [${message(initializer.whenTrue.text)}, ${message(initializer.whenFalse.text)}]`,
        );
      else {
        const ref = reference(initializer);
        if (ref) fields.push(`${annotationKey}: { owner: ${ref.owner}, field: ${ref.field} }`);
      }
    }
    if (!fields.length) return;
    imports.add("markUiCopy");
    for (const property of object.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        [
          "code",
          "kind",
          "type",
          "field",
          "skeleton",
          "operator",
          "mode",
          "status",
          "level",
          "variant",
          "severity",
          "placement",
          "align",
          "side",
          "role",
        ].includes(nameOf(property, file)) &&
        ts.isStringLiteral(property.initializer)
      )
        add(property.initializer.end, property.initializer.end, " as const");
    }
    add(object.getStart(file), object.getStart(file), "markUiCopy(", 20);
    const end =
      ts.isAsExpression(object.parent) && object.parent.type.getText(file) === "const" ? object.parent.end : object.end;
    add(end, end, `, {${fields.join(", ")}}${inherited.length ? `, [${inherited.join(", ")}]` : ""})`, 10);
  };
  const walk = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === "translateMessage" &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      messages.add(normalize(node.arguments[0].text));
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === "markUiCopy" &&
      node.arguments[1] &&
      ts.isObjectLiteralExpression(node.arguments[1])
    ) {
      let owner = node.arguments[0];
      while (owner && (ts.isParenthesizedExpression(owner) || ts.isAsExpression(owner))) owner = owner.expression;
      for (const property of node.arguments[1].properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        if (ts.isStringLiteral(property.initializer)) messages.add(normalize(property.initializer.text));
        if (ts.isArrayLiteralExpression(property.initializer))
          for (const item of property.initializer.elements)
            if (ts.isStringLiteral(item)) messages.add(normalize(item.text));
        if (already && ts.isStringLiteral(property.name) && owner && ts.isObjectLiteralExpression(owner)) {
          const original = owner.properties.find(
            (item) =>
              item.name && ts.isComputedPropertyName(item.name) && item.name.getText(file) === property.name.text,
          );
          if (
            original?.name &&
            ts.isComputedPropertyName(original.name) &&
            (ts.isIdentifier(original.name.expression) ||
              ts.isPropertyAccessExpression(original.name.expression) ||
              ts.isStringLiteral(original.name.expression))
          )
            add(property.name.getStart(file), property.name.end, original.name.getText(file));
        }
      }
    }
    if (
      ts.isJsxAttribute(node) &&
      nameOf(node, file) === "text" &&
      node.parent.parent.tagName?.getText(file) === "LocalizedText"
    ) {
      const value =
        node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (value && ts.isStringLiteral(value)) messages.add(normalize(value.text));
    }
    if (!already && !schemaOrCode(node, file)) {
      if (ts.isObjectLiteralExpression(node)) annotate(node);
      if (ts.isJsxText(node)) {
        const value = jsxText(node.text);
        if (isCopy(normalize(value))) {
          add(node.pos, node.end, `<LocalizedText text={${message(value)}} />`);
          imports.add("LocalizedText");
          presentationEdits.push(node);
        }
      } else if (
        ts.isJsxAttribute(node) &&
        attributes.has(nameOf(node, file)) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        isCopy(node.initializer.text)
      ) {
        replace(node.initializer, `{translateMessage(${message(node.initializer.text)})}`);
        imports.add("translateMessage");
      } else if (ts.isTemplateExpression(node) && displayed(node, file)) {
        const text =
          node.head.text + node.templateSpans.map((span, index) => `%{${index}}${span.literal.text}`).join("");
        if (isCopy(text.replace(/%\{\d+\}/g, ""))) {
          replace(
            node,
            `translateMessage(${message(text)}, [${node.templateSpans.map((span) => span.expression.getText(file)).join(", ")}])`,
          );
          imports.add("translateMessage");
          return;
        }
      } else if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        isCopy(node.text) &&
        displayed(node, file) &&
        !ts.isJsxAttribute(node.parent)
      ) {
        replace(node, `translateMessage(${message(node.text)})`);
        imports.add("translateMessage");
      } else if (ts.isPropertyAccessExpression(node) && copyFields.has(node.name.text) && displayed(node, file)) {
        const evaluated = ts.isIdentifier(node.expression) ? `, ${node.getText(file)}` : "";
        replace(
          node,
          `localizedProperty(${node.expression.getText(file)}, ${JSON.stringify(node.name.text)}${evaluated})`,
        );
        imports.add("localizedProperty");
        return;
      } else if (
        ts.isElementAccessExpression(node) &&
        displayed(node, file) &&
        ts.isIdentifier(node.expression) &&
        /(?:labels|messages|errors|reasons|kinds|titles|descriptions)$/i.test(node.expression.text)
      ) {
        replace(
          node,
          `localizedProperty(${node.expression.text}, ${node.argumentExpression.getText(file)}, ${node.getText(file)})`,
        );
        imports.add("localizedProperty");
        return;
      } else if (
        ts.isIdentifier(node) &&
        displayed(node, file) &&
        !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
        !ts.isJsxAttribute(node.parent)
      ) {
        const binding = resolve(node, node.text);
        if (binding) {
          replace(
            node,
            `localizedProperty(${binding.owner}, ${binding.fieldExpression ?? JSON.stringify(binding.field)}, ${node.text})`,
          );
          imports.add("localizedProperty");
        }
      } else if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"].includes(node.expression.name.text) &&
        node.arguments.length === 0
      ) {
        add(node.end - 1, node.end - 1, "getIntlLocale()");
        imports.add("getIntlLocale");
        presentationEdits.push(node);
      }
      if (ts.isCallExpression(node) && /(?:^|\.)useMemo$/.test(node.expression.getText(file))) memos.push(node);
    }
    ts.forEachChild(node, walk);
  };
  walk(file);
  if (already) {
    let code = source;
    for (const change of edits.sort((a, b) => b.start - a.start))
      code = code.slice(0, change.start) + change.text + code.slice(change.end);
    return { code, messages: [...messages] };
  }
  if (!imports.size) return { code: source, messages: [...messages] };
  const serverOnly =
    /export\s+(?:const\s+metadata|(?:async\s+)?function\s+generateMetadata)/.test(source) ||
    /["']use server["']/.test(source);
  if (!serverOnly && presentationEdits.length)
    for (const node of functions) {
      if (
        !node.body ||
        !/^(?:[A-Z]|use[A-Z])/.test(functionName(node, file)) ||
        node.modifiers?.some((item) => item.kind === ts.SyntaxKind.AsyncKeyword)
      )
        continue;
      const ownMemos = memos.filter((memo) => {
        for (let parent = memo.parent; parent; parent = parent.parent) {
          if (parent === node) break;
          if (ts.isFunctionLike(parent)) return false;
        }
        return (
          memo.pos >= node.pos &&
          memo.end <= node.end &&
          presentationEdits.some((change) => {
            if (ts.isJsxText(change) || change.pos < memo.pos || change.end > memo.end) return false;
            for (let parent = change.parent; parent; parent = parent.parent)
              if (ts.isFunctionLike(parent)) return parent === memo.arguments[0];
            return false;
          })
        );
      });
      const ownsMemo = ownMemos.length > 0;
      imports.add("useUiLocale");
      prefix(node, ownsMemo ? "const cocaUiLocale = useUiLocale();" : "useUiLocale();");
      for (const memo of ownMemos)
        if (memo.arguments[1] && ts.isArrayLiteralExpression(memo.arguments[1])) {
          const dependencies = memo.arguments[1];
          add(
            dependencies.end - 1,
            dependencies.end - 1,
            `${dependencies.elements.length && !dependencies.elements.hasTrailingComma ? ", " : ""}cocaUiLocale`,
          );
        }
    }
  for (const [node, lines] of prefixes) {
    if (!node.body) continue;
    if (ts.isBlock(node.body))
      add(node.body.getStart(file) + 1, node.body.getStart(file) + 1, `\n  ${lines.join("\n  ")}`, 10);
    else {
      add(node.body.getStart(file), node.body.getStart(file), `{ ${lines.join(" ")} return (`, 10);
      add(node.body.end, node.body.end, "); }", 20);
    }
  }
  const directives = file.statements.filter(
    (node) => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression),
  );
  const insertion = directives.at(-1)?.end ?? 0;
  const client =
    !serverOnly && imports.has("useUiLocale") && !directives.some((node) => node.expression.text === "use client");
  add(
    insertion,
    insertion,
    `${client ? '\n"use client";\n' : "\n"}import { ${[...imports].sort().join(", ")} } from "@/lib/i18n";\n`,
  );
  let code = source;
  for (const change of edits.sort((a, b) => b.start - a.start || b.end - a.end || b.priority - a.priority))
    code = code.slice(0, change.start) + change.text + code.slice(change.end);
  return { code, messages: [...messages] };
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return /(?:__fixtures__|i18n)$/.test(entry.name) ? [] : sourceFiles(file);
    return /\.tsx?$/.test(file) && !/(?:\.test\.|\.test-d\.|schema\.d\.ts)/.test(file) ? [file] : [];
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve("src");
  const catalog = new Set();
  let changed = 0;
  for (const file of sourceFiles(root)) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    if (
      ["app/layout.tsx", "app/account/layout.tsx"].includes(relative) ||
      /(?:^|\/)(?:design|types)\.tsx?$/.test(relative)
    )
      continue;
    const source = fs.readFileSync(file, "utf8");
    const result = localizeSource(source, relative);
    result.messages.forEach((value) => catalog.add(value));
    if (result.code !== source) {
      changed += 1;
      if (process.argv.includes("--write")) fs.writeFileSync(file, result.code);
    }
  }
  const out = process.argv.find((value) => value.startsWith("--catalog="));
  if (out) fs.writeFileSync(out.slice("--catalog=".length), JSON.stringify([...catalog].sort(), null, 2));
  process.stdout.write(JSON.stringify({ files: changed, messages: catalog.size }) + "\n");
}
