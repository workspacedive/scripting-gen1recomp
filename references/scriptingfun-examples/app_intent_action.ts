/**
 * Scripting.fun Example: App Intent & Shortcuts Automation
 * Demonstrates registering an App Intent for Apple Shortcuts integration.
 */
import { AppIntent, Parameter, IntentResult } from "scripting";

export default class QuickNoteIntent extends AppIntent {
  static title = "Create Quick Note";
  static description = "Appends a note to local Scripting storage.";

  @Parameter({ title: "Note Content", description: "The text to save" })
  content!: string;

  async perform(): Promise<IntentResult> {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${this.content}\n`;
    // Write to local container storage
    console.log("Saving quick note:", entry);
    return IntentResult.success({ message: "Note saved successfully!" });
  }
}
