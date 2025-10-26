import * as vscode from "vscode";
import * as path from "path";

// AI analiza fajlova pomocu Copilota
export class AIService
{
    private static readonly MAX_FILE_SIZE = 100000;
    private static readonly SUPPORTED_EXTENSIONS = [
        '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.cpp', '.c', '.h',
        '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.dart', '.scala', '.sh',
        '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.scss',
        '.sql', '.r', '.m', '.pl', '.lua', '.vim', '.dockerfile', '.gitignore'
    ];

    public static async generateFileSummary(uri: vscode.Uri): Promise<string>
    {
        const ext = path.extname(uri.fsPath).toLowerCase();
        if (!this.SUPPORTED_EXTENSIONS.includes(ext))
        {
            return "File type not supported for AI analysis.";
        }

        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.size > this.MAX_FILE_SIZE)
        {
            return "File too large for AI analysis (>100KB).";
        }

        // citaj fajl
        const content = await vscode.workspace.fs.readFile(uri);
        const textContent = Buffer.from(content).toString('utf8');

        return await this.generateCopilotSummary(textContent, path.basename(uri.fsPath), ext);
    }

    public static async generateCustomSummary(prompt: string): Promise<string>
    {
        try
        {
            return await this.generateCopilotCustomSummary(prompt);
        } catch (error)
        {
            console.error('Error generating custom AI summary:', error);
            return "Error generating custom summary. GitHub Copilot may be unavailable.";
        }
    }

    private static async generateCopilotSummary(content: string, filename: string, extension: string): Promise<string>
    {
        try
        {
            const prompt = this.createAnalysisPrompt(content, filename, extension);

            // zovi copilot api
            const copilotResponse = await this.invokeCopilotAPI(prompt);

            if (copilotResponse)
            {
                return this.formatCopilotResponse(copilotResponse, filename);
            } else
            {
                return "GitHub Copilot is required for AI summaries. Please ensure GitHub Copilot works";
            }

        }
        catch (error)
        {
            console.error('Error invoking GitHub Copilot:', error);
            return "GitHub Copilot is required for AI summaries. Please ensure GitHub Copilot works";
        }
    }

    private static async generateCopilotCustomSummary(prompt: string): Promise<string>
    {
        try
        {
            const copilotResponse = await this.invokeCopilotAPI(prompt);

            if (copilotResponse)
            {
                return this.formatCopilotResponse(copilotResponse, 'Git Diff Analysis');
            } else
            {
                return "GitHub Copilot is required for diff analysis. Please ensure GitHub Copilot works";
            }
        } catch (error)
        {
            console.error('Error invoking GitHub Copilot for custom prompt:', error);
            return "GitHub Copilot is required for diff analysis. Please ensure GitHub Copilot works";
        }
    }

    private static createAnalysisPrompt(content: string, filename: string, extension: string): string
    {
        const truncatedContent = content.length > 3000 ? content.substring(0, 3000) + "..." : content;

        return `Please analyze this ${extension} file named "${filename}" and provide a comprehensive summary:

\`\`\`${extension.substring(1)}
${truncatedContent}
\`\`\`

Please provide:
1. **Purpose**: What does this file do?
2. **Key Components**: Main functions, classes, or sections
3. **Dependencies**: Important imports or external dependencies
4. **Complexity**: Estimate of code complexity (Low/Medium/High)
5. **Framework/Technology**: Any specific frameworks or technologies used
6. **Notable Patterns**: Design patterns, architectural decisions, or code style
7. **Recommendations**: Any suggestions for improvement or important notes

Format the response in markdown with clear sections and bullet points.`;
    }

    // Ova metoda glavna!!
    private static async invokeCopilotAPI(prompt: string): Promise<string | null>
    {
        try
        {
            // check if GitHub Copilot extension is available
            const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
            if (!copilotExtension)
            {
                console.log('GitHub Copilot extension not found');
                return null;
            }

            // ensure the extension is activated
            if (!copilotExtension.isActive)
            {
                await copilotExtension.activate();
            }

            // try to use GitHub Copilot Chat API if available
            try
            {
                // first try the newer language model API (VS Code 1.90+)
                if ('lm' in vscode && typeof (vscode as any).lm?.selectChatModels === 'function')
                {
                    const models = await (vscode as any).lm.selectChatModels({
                        vendor: 'copilot',
                        family: 'gpt-4'
                    });

                    if (models.length > 0)
                    {
                        const model = models[0];
                        const messages = [
                            (vscode as any).LanguageModelChatMessage.User(prompt)
                        ];

                        const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

                        let result = '';
                        for await (const chunk of response.text)
                        {
                            result += chunk;
                        }

                        return result;
                    }
                }
            } catch (lmError)
            {
                console.log('Language model API not available, trying alternative methods:', lmError);
            }

            // try using Copilot commands
            try
            {
                // try different command variations that might be available
                const commands = [
                    'github.copilot.generate',
                    'github.copilot.chat.explainThis',
                    'github.copilot.interactiveEditor.generate',
                    'copilot.generate'
                ];

                for (const command of commands)
                {
                    try
                    {
                        const result = await vscode.commands.executeCommand(command, {
                            prompt: prompt,
                            language: 'markdown'
                        });

                        if (result && typeof result === 'string')
                        {
                            return result;
                        }
                    } catch (cmdError)
                    {
                        // try next command
                        continue;
                    }
                }
            }
            catch (commandError)
            {
                console.error('Error using Copilot commands:', commandError);
            }

            // try accessing Copilot extension API directly
            try
            {
                const api = copilotExtension.exports;
                if (api && typeof api.generateCompletion === 'function')
                {
                    const result = await api.generateCompletion(prompt);
                    if (result)
                    {
                        return result;
                    }
                }
            } catch (apiError)
            {
                console.error('Error accessing Copilot API:', apiError);
            }

            // if all methods fail, show a helpful message
            vscode.window.showInformationMessage(
                'GitHub Copilot is installed but the API is not accessible. Please ensure you have the latest version and are signed in.',
                'Open Copilot Chat'
            ).then(action =>
            {
                if (action === 'Open Copilot Chat')
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

    private static formatCopilotResponse(response: string, filename: string): string
    {
        const footer = `\n\n---\n\n*Summary generated on ${new Date().toLocaleString()}*`;

        return response + footer;
    }
}
