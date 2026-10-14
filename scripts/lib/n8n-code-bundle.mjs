import { buildSync } from 'esbuild';
import ts from 'typescript';

// n8n task runners must receive ordinary data properties, not export getters.
export function bundleForN8n(entryPoint, namespace) {
  if (!/^[A-Za-z_$][\w$]*$/.test(namespace)) throw new Error('invalid_bundle_namespace');
  const code = buildSync({
    entryPoints: [entryPoint], bundle: true, write: false, format: 'esm',
    platform: 'neutral', target: 'es2022', minify: true,
  }).outputFiles[0].text;
  const source = ts.createSourceFile('bundle.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const exports = [];
  const edits = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportAssignment(statement)) {
      throw new Error('unsupported_bundle_module');
    }
    if (!ts.isExportDeclaration(statement)) continue;
    if (statement.moduleSpecifier || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      throw new Error('unsupported_bundle_export');
    }
    for (const item of statement.exportClause.elements) {
      const binding = item.propertyName ?? item.name;
      if (!ts.isIdentifier(binding)) throw new Error('unsupported_bundle_binding');
      exports.push(`${JSON.stringify(item.name.text)}:${binding.text}`);
    }
    edits.push([statement.getStart(source), statement.end]);
  }
  if (!exports.length) throw new Error('bundle_has_no_exports');
  let body = code;
  for (const [start, end] of edits.reverse()) body = body.slice(0, start) + body.slice(end);
  return `var ${namespace}=(()=>{${body}\nreturn {${exports.join(',')}};})();\n`;
}

export function replaceN8nBundles(code, bundles) {
  const source = ts.createSourceFile('node.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  const visit = statement => {
    if (!ts.isVariableStatement(statement)) {
      ts.forEachChild(statement, visit);
      return;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !bundles[declaration.name.text]) continue;
      if (statement.declarationList.declarations.length !== 1 || !declaration.initializer ||
          !ts.isCallExpression(declaration.initializer)) throw new Error('unexpected_bundle_declaration');
      edits.push([statement.getStart(source), statement.end, bundles[declaration.name.text].trimEnd()]);
      return;
    }
    ts.forEachChild(statement, visit);
  };
  visit(source);
  for (const [start, end, replacement] of edits.reverse()) code = code.slice(0, start) + replacement + code.slice(end);
  return code;
}
