import assert from "node:assert/strict";
import test from "node:test";
import { localizeSource } from "./localize-ui.mjs";

test("marks UI text and accessible names while preserving API values and code examples", () => {
  const source = `"use client";
const options = [{label: "Models", value: "Models", model: "Models", key: "Name"}];
export function Form() { return <div><label>Name</label><input placeholder="Search models" aria-label="Name" value="Models" /><code>Models</code><pre>API Name</pre><p>{userValue}</p></div>; }`;
  const result = localizeSource(source, "components/Form.tsx");
  assert.match(result.code, /LocalizedText text=\{"Name"\}/);
  assert.match(result.code, /placeholder=\{translateMessage\("Search models"\)\}/);
  assert.match(result.code, /markUiCopy\(\{label: "Models"/);
  assert.doesNotMatch(result.code, /get label\(\)/);
  assert.match(result.code, /value: "Models", model: "Models", key: "Name"/);
  assert.match(result.code, /<code>Models<\/code><pre>API Name<\/pre>/);
  assert.match(result.code, /\{userValue\}/);
  assert.ok(result.messages.includes("Search models"));
  assert.ok(!result.messages.includes("API Name"));
});

test("keeps column identities and translates template copy without translating inserted data", () => {
  const source =
    'export const columns = [{header:"Name",cell:()=> <span>Details</span>}]; export function View(){return <p title={`Model ${modelId}`}>{`Created ${count} keys`}</p>}';
  const result = localizeSource(source, "components/Table.tsx");
  assert.match(result.code, /header:"Name"/);
  assert.doesNotMatch(result.code, /header:\s*\(\) =>/);
  assert.ok(result.messages.includes("Created %{0} keys"));
  assert.match(result.code, /translateMessage\("Model %\{0\}", \[modelId\]\)/);
  assert.match(result.code, /\[count\]/);
});

test("does not rewrite JSON schemas or API descriptions and is idempotent", () => {
  const source =
    'const schema = {type:"object",properties:{name:{type:"string",description:"Model identifier"}}}; export function View(){return <button>Save</button>}';
  const first = localizeSource(source, "components/View.tsx");
  assert.ok(first.code.includes('description:"Model identifier"'));
  const second = localizeSource(first.code, "components/View.tsx");
  assert.equal(second.code, first.code);
});

test("preserves data lookup keys, role comparisons, membership checks and monospace examples", () => {
  const source =
    'export function View(){return <div><p>{row["model"]}</p><p>{role === "Admin" ? "Administrator" : "User"}</p><p>{models.includes("all") ? "All models" : model}</p><span className="font-mono">User ID</span></div>}';
  const result = localizeSource(source, "components/Data.tsx");
  assert.ok(result.code.includes('row["model"]'));
  assert.ok(result.code.includes('role === "Admin"'));
  assert.ok(result.code.includes('models.includes("all")'));
  assert.ok(result.code.includes('<span className="font-mono">User ID</span>'));
  assert.ok(result.messages.includes("All models"));
});

test("preserves destructured and computed property names inside render callbacks", () => {
  const source =
    'export function View(){return <Form>{({"aria-invalid": invalid}) => {const {"aria-describedby": description} = props; return <span aria-label="Name">Name</span>}}</Form>}';
  const result = localizeSource(source, "components/Field.tsx");
  assert.ok(result.code.includes('"aria-invalid": invalid'));
  assert.ok(result.code.includes('"aria-describedby": description'));
});

test("preserves persisted chat titles, API descriptions and JSON placeholders", () => {
  const source =
    'export function buildData(){return {title:"New conversation",description:"Skill configuration"}}; export function View(){return <input placeholder=\'{"model":"gpt-example"}\'/>}';
  const result = localizeSource(source, "components/View.tsx");
  assert.ok(result.code.includes('title:"New conversation"'));
  assert.ok(result.code.includes('description:"Skill configuration"'));
  assert.ok(result.code.includes('placeholder=\'{"model":"gpt-example"}\''));
});

test("uses marked properties only at presentation and preserves label keys, comparisons and serialization", () => {
  const source =
    'const rows=[{label:"Models",value:"model-id"}]; export function View(){return <div>{rows.map(({label,value})=><button key={label} value={value}>{label}</button>)}</div>}';
  const result = localizeSource(source, "components/View.tsx");
  assert.ok(result.code.includes('label:"Models",value:"model-id"'));
  assert.ok(result.code.includes("key={label}"));
  assert.ok(result.code.includes("value={value}"));
  assert.match(result.code, /localizedProperty\(cocaCopyProps\d+, "label", label\)/);
});

test("does not rewrite JSX tag names or overlapping destructured default parameters", () => {
  const source = 'export function View({label, roles=[{label:"Admin",value:"admin"}]}){return <label>{label}</label>}';
  const result = localizeSource(source, "components/View.tsx");
  assert.ok(result.code.includes("<label>"));
  assert.ok(result.code.includes("</label>"));
  assert.ok(!result.code.includes("<localizedProperty"));
  assert.ok(result.code.includes('value:"admin"'));
});

test("keeps computed UI copy map keys as their evaluated constants", () => {
  const result = localizeSource(
    'const NONE="none"; export const LABELS = {[NONE]:"Never resets"};',
    "components/labels.ts",
  );
  assert.match(result.code, /\{\[NONE\]: "Never resets"\}/);
  assert.ok(!result.code.includes('"[NONE]":'));
});
