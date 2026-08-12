let jsonMode = false;
let quiet = false;

export function setLogMode(opts: { json?: boolean; quiet?: boolean }): void {
  jsonMode = Boolean(opts.json);
  quiet = Boolean(opts.quiet);
}

export function info(msg: string): void {
  if (!jsonMode && !quiet) console.error(msg);
}

export function warn(msg: string): void {
  if (!jsonMode) console.error(`warning: ${msg}`);
}

export function error(msg: string): void {
  console.error(`error: ${msg}`);
}

export function out(data: unknown): void {
  if (typeof data === "string") {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
