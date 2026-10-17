// html is htm bound to preact: components write markup as tagged templates,
// with no build step (decisions/0003).
import { h } from "preact";
import htm from "htm";

export const html = htm.bind(h);
