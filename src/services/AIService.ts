import * as vscode from "vscode";
import * as path from "path";

// AI analiza fajlova pomocu copilota
export class AIService
{
    // summary za fajl
    public static async generateFileSummary(uri: vscode.Uri): Promise<string>
    {
        var ext = path.extname(uri.fsPath).toLowerCase();

        // proveri da li je dobar tip fajla
        var supportedExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.cpp', '.c', '.h', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.dart', '.scala', '.sh', '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.scss', '.sql', '.r', '.m', '.pl', '.lua', '.vim', '.dockerfile', '.gitignore'];

        if (supportedExts.includes(ext) == false)
        {
            return "File type not supported for AI analysis.";
        }

        var stat = await vscode.workspace.fs.stat(uri);
        var fileSize = stat.size;
        if (fileSize > 100000) // 100kb max
        {
            return "File too large for AI analysis (>100KB).";
        }

        // citaj fajl sad
        var content = await vscode.workspace.fs.readFile(uri);
        var textContent = Buffer.from(content).toString('utf8');
        var fileName = path.basename(uri.fsPath);

        var summaryResult = await this.getCopilotSummary(textContent, fileName, ext);
        return summaryResult;
    }

    public static async generateCustomSummary(prompt: string): Promise<string>
    {
        try
        {
            var result = await this.getCustomCopilotSummary(prompt);
            return result;
        } catch (error)
        {
            console.error('Error generating custom AI summary:', error);
            return "Error generating custom summary. GitHub Copilot may be unavailable.";
        }
    }

    // dobavi summary od copilota
    private static async getCopilotSummary(content: string, filename: string, extension: string): Promise<string>
    {
        try
        {
            var promptText = this.makePrompt(content, filename, extension);

            // zovi copilot api
            var copilotResponse = await this.callCopilot(promptText);

            if (copilotResponse)
            {
                var formatted = this.dodajFooter(copilotResponse, filename);
                return formatted;
            }
            else
            {
                return "GitHub Copilot not working rn. Make sure it's installed";
            }

        }
        catch (error)
        {
            console.error('Error invoking GitHub Copilot:', error);
            return "Copilot error, check if extension works";
        }
    }

    private static async getCustomCopilotSummary(prompt: string): Promise<string>
    {
        try
        {
            var copilotResponse = await this.callCopilot(prompt);

            if (copilotResponse)
            {
                var formatted = this.dodajFooter(copilotResponse, 'Git Diff Analysis');
                return formatted;
            }
            else
            {
                return "Copilot needed for diff";
            }
        } catch (error)
        {
            console.error('Error invoking GitHub Copilot for custom prompt:', error);
            return "Copilot error";
        }
    }

    // napravi prompt
    private static makePrompt(content: string, filename: string, extension: string): string
    {
        var truncatedContent = content;
        if (content.length > 3000)
        {
            truncatedContent = content.substring(0, 3000) + "...";  // skrati ako je predug
        }

        var extName = extension.substring(1);

        // buildujem string manuelno jer ne znam bolji nacin lol
        var promptString = "Please analyze this " + extension + " file named " + filename + " and provide a comprehensive summary:\n\n";
        promptString += "```" + extName + "\n";
        promptString += truncatedContent + "\n";
        promptString += "\n" + "\n";
        promptString += "Please provide:\n";
        promptString += "1. Purpose: What does this file do?\n";
        promptString += "2. Key Components: Main functions, classes, or sections\n";
        promptString += "3. Dependencies: Important imports or external dependencies\n";
        promptString += "4. Complexity: Estimate of code complexity (Low/Medium/High)\n";
        promptString += "5. Framework/Technology: Any specific frameworks or technologies used\n";
        promptString += "6. Notable Patterns: Design patterns, architectural decisions, or code style\n";
        promptString += "7. Recommendations: Any suggestions for improvement or important notes\n\n";
        promptString += "Format the response in markdown with clear sections and bullet points.";

        return promptString;
    }

    // Ova metoda glavna!!
    private static async callCopilot(prompt: string): Promise<string | null>
    {
        try
        {
            var copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
            if (!copilotExtension)
            {
                console.log('GitHub Copilot extension not found');
                return null;
            }

            var isActive = copilotExtension.isActive;
            if (!isActive)
            {
                await copilotExtension.activate();
            }

            // probaj novi api prvo
            var hasLM = 'lm' in vscode;
            if (hasLM)
            {
                var lmAPI = (vscode as any).lm;
                if (lmAPI && typeof lmAPI.selectChatModels == 'function')
                {
                    var models = await lmAPI.selectChatModels({
                        vendor: 'copilot',
                        family: 'gpt-4'
                    });

                    if (models.length > 0)
                    {
                        var model = models[0];
                        var userMessage = (vscode as any).LanguageModelChatMessage.User(prompt);
                        var messages = [userMessage];

                        var token = new vscode.CancellationTokenSource().token;
                        var response = await model.sendRequest(messages, {}, token);

                        var result = '';
                        for await (var chunk of response.text)
                        {
                            result += chunk;
                        }

                        if (result.length > 0)
                        {
                            return result;
                        }
                    }
                }
            }

            // probaj stare komande sad
            var cmd1 = 'github.copilot.generate';
            try
            {
                var res1 = await vscode.commands.executeCommand(cmd1, {
                    prompt: prompt,
                    language: 'markdown'
                });
                if (res1 && typeof res1 == 'string')
                {
                    return res1;
                }
            } catch (e1) { }

            var cmd2 = 'github.copilot.chat.explainThis';
            try
            {
                var res2 = await vscode.commands.executeCommand(cmd2, {
                    prompt: prompt,
                    language: 'markdown'
                });
                if (res2 && typeof res2 == 'string')
                {
                    return res2;
                }
            } catch (e2) { }

            var cmd3 = 'github.copilot.interactiveEditor.generate';
            try
            {
                var res3 = await vscode.commands.executeCommand(cmd3, {
                    prompt: prompt,
                    language: 'markdown'
                });
                if (res3 && typeof res3 == 'string')
                {
                    return res3;
                }
            } catch (e3) { }

            var cmd4 = 'copilot.generate';
            try
            {
                var res4 = await vscode.commands.executeCommand(cmd4, {
                    prompt: prompt,
                    language: 'markdown'
                });
                if (res4 && typeof res4 == 'string')
                {
                    return res4;
                }
            } catch (e4) { }

            // probaj direktan api ako ima
            var api = copilotExtension.exports;
            if (api)
            {
                if (typeof api.generateCompletion == 'function')
                {
                    var apiResult = await api.generateCompletion(prompt);
                    if (apiResult)
                    {
                        return apiResult;
                    }
                }
            }

            // nista ne radi, pokazi poruku korisniku
            vscode.window.showInformationMessage(
                'GitHub Copilot is installed but the API is not accessible.',
                'Open Copilot Chat'
            ).then(action =>
            {
                if (action == 'Open Copilot Chat')
                {
                    vscode.commands.executeCommand('github.copilot.interactiveEditor.explain');
                }
            });

            return null;
        } catch (error)
        {
            console.error('Error invoking Copilot API:', error);
            return null;
        }
    }

    // dodaj futer na kraj
    private static dodajFooter(response: string, filename: string): string
    {
        var now = new Date();
        var dateStr = now.toLocaleString();
        var footer = `\n\n---\n\n*Summary generated on ${dateStr}`;
        var finalResponse = response + footer;
        return finalResponse;
    }
}
