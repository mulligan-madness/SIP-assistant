const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const debug = require('debug')('chatbot:chat');
const { LLMProviderFactory } = require('../providers/factory');
const { storage } = require('./storage');

class ChatService {
  constructor() {
    this.chatHistory = {};
  }

  // Process a chat message and generate a response
  async processMessage(message, sessionId, compressedContext, sipData, messageHistory = null) {
    try {
      debug(`Processing message for session ${sessionId}`);
      console.log(`[CHAT] Processing message for session ${sessionId}: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
      
      // Initialize chat history for this session if it doesn't exist
      if (!this.chatHistory[sessionId]) {
        this.chatHistory[sessionId] = [];
        console.log(`[CHAT] Initialized new chat history for session ${sessionId}`);
      }
      
      // If message history is provided from the frontend, use it to sync the server-side history
      if (messageHistory && Array.isArray(messageHistory)) {
        console.log(`[CHAT] Received message history from frontend with ${messageHistory.length} messages`);
        
        // Only update the chat history if the incoming history is longer
        // This prevents losing context if multiple clients are active
        if (messageHistory.length > this.chatHistory[sessionId].length) {
          console.log(`[CHAT] Using frontend message history (${messageHistory.length} messages) instead of server history (${this.chatHistory[sessionId].length} messages)`);
          this.chatHistory[sessionId] = messageHistory;
        } else {
          console.log(`[CHAT] Keeping server message history (${this.chatHistory[sessionId].length} messages) as it's longer than frontend history (${messageHistory.length} messages)`);
          
          // Add the latest user message if it's not already in the history
          const latestUserMessage = messageHistory[messageHistory.length - 1];
          if (latestUserMessage && latestUserMessage.role === 'user') {
            const existingMessage = this.chatHistory[sessionId].find(
              m => m.role === 'user' && m.content === latestUserMessage.content
            );
            
            if (!existingMessage) {
              this.chatHistory[sessionId].push(latestUserMessage);
              console.log(`[CHAT] Added latest user message to existing server history`);
            }
          }
        }
      } else {
        // If no message history is provided, add the user message to the existing history
        this.chatHistory[sessionId].push({
          role: 'user',
          content: message
        });
        console.log(`[CHAT] Added user message to history. History length: ${this.chatHistory[sessionId].length}`);
      }
      
      // Prepare the messages array for the LLM
      const messages = this.prepareMessagesForLLM(sessionId, compressedContext, sipData);
      console.log(`[CHAT] Prepared messages for LLM. Total messages: ${messages.length}`);
      
      // Get response from LLM
      console.log(`[CHAT] Sending request to LLM provider: ${global.llmProvider ? global.llmProvider.constructor.name : 'undefined'}`);
      const llmResponse = await global.llmProvider.chat(messages);
      console.log(`[CHAT] Received response from LLM: "${llmResponse.substring(0, 50)}${llmResponse.length > 50 ? '...' : ''}"`);
      
      // Add assistant response to history
      this.chatHistory[sessionId].push({
        role: 'assistant',
        content: llmResponse
      });
      console.log(`[CHAT] Added assistant response to history. History length: ${this.chatHistory[sessionId].length}`);
      
      // Trim history if it gets too long
      this.trimChatHistory(sessionId);
      
      return llmResponse;
    } catch (error) {
      console.error('[CHAT] Error processing message:', error);
      throw error;
    }
  }
  
  // Prepare messages array for the LLM, including system context
  prepareMessagesForLLM(sessionId, compressedContext, sipData) {
    const systemPrompt = this.generateSystemPrompt(compressedContext, sipData);
    
    return [
      { role: 'system', content: systemPrompt },
      ...this.chatHistory[sessionId]
    ];
  }
  
  // Generate the system prompt with context
  generateSystemPrompt(compressedContext, sipData) {
    let prompt = `You are SIP-Assistant, an AI designed to help with SuperRare Improvement Proposals (SIPs).
Your goal is to assist users in drafting, understanding, and improving governance proposals.
Be helpful, informative, and concise. If you don't know something, say so rather than making up information.

Today's date is ${new Date().toISOString().split('T')[0]}.
`;

    if (compressedContext) {
      prompt += `\n## Compressed SIP Context\n${compressedContext}\n`;
    }
    
    if (sipData && sipData.length > 0) {
      prompt += `\n## Available SIPs\nThere are ${sipData.length} SIPs available for reference.\n`;
    }
    
    return prompt;
  }
  
  // Trim chat history to prevent it from getting too long
  trimChatHistory(sessionId) {
    const maxHistoryLength = 20; // Keep last 10 exchanges (20 messages)
    if (this.chatHistory[sessionId].length > maxHistoryLength) {
      // Keep the first system message and the last maxHistoryLength messages
      const systemMessages = this.chatHistory[sessionId].filter(msg => msg.role === 'system');
      const recentMessages = this.chatHistory[sessionId].slice(-maxHistoryLength);
      this.chatHistory[sessionId] = [...systemMessages, ...recentMessages];
    }
  }
  
  // Get chat history for a session
  getChatHistory(sessionId) {
    return this.chatHistory[sessionId] || [];
  }
  
  // Clear chat history for a session
  clearChatHistory(sessionId) {
    this.chatHistory[sessionId] = [];
    return { success: true, message: 'Chat history cleared' };
  }
  
  // Save chat history to file
  async saveChatToFile(sessionId, outputDir = null) {
    if (!this.chatHistory[sessionId] || this.chatHistory[sessionId].length === 0) {
      return { success: false, message: 'No chat history to save' };
    }
    
    const now = new Date();
    const timestamp = now.toISOString();
    const date = now.toISOString().split('T')[0];
    
    if (!outputDir) {
      outputDir = path.join(__dirname, '..', '..', 'output');
    }
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const filePath = path.join(outputDir, `chat-history-${sessionId}-${date}.md`);
    
    try {
      // Format the conversation
      let formattedConversation = `# Chat History - ${timestamp}\n\n`;
      
      for (const message of this.chatHistory[sessionId]) {
        if (message.role === 'system') continue; // Skip system messages
        
        formattedConversation += `## ${message.role === 'user' ? 'User' : 'SIP Assistant'}\n${message.content}\n\n`;
      }
      
      // Write to file
      fs.writeFileSync(filePath, formattedConversation);
      debug(`Chat history saved to ${filePath}`);
      
      return { 
        success: true, 
        message: 'Chat history saved', 
        filePath 
      };
    } catch (error) {
      debug(`Error saving chat history: ${error.message}`);
      return { 
        success: false, 
        message: `Error saving chat history: ${error.message}` 
      };
    }
  }
  
  // Compress SIP data using LLM for context
  async compressSIPDataWithLLM(sipData, maxRetries = 3) {
    if (!sipData || sipData.length === 0) {
      debug('No SIP data to compress');
      return null;
    }
    
    debug(`Compressing ${sipData.length} SIPs for context`);
    
    // Create a summary of the SIPs
    const sipSummaries = sipData.map(sip => {
      return `ID: ${sip.id}
Title: ${sip.t}
Date: ${sip.d}
Status: ${sip.status || 'Unknown'}
URL: ${sip.url}
Summary: ${this.extractSummary(sip.c)}`;
    }).join('\n\n');
    
    // Create the prompt for the LLM
    const prompt = `I need to create a compressed context of SuperRare Improvement Proposals (SIPs) for an AI assistant.
Please analyze these SIP summaries and create a concise but comprehensive overview that captures:
1. The key governance mechanisms
2. Important precedents and decisions
3. Common patterns and themes
4. Current governance status

Here are the SIP summaries:

${sipSummaries}

Create a compressed context (max 2000 words) that the AI can use to understand SuperRare governance.`;
    
    // Try to get a response from the LLM
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        debug(`Compression attempt ${attempt}/${maxRetries}`);
        
        const messages = [
          { role: 'system', content: 'You are an expert in governance systems and data compression.' },
          { role: 'user', content: prompt }
        ];
        
        const compressedContext = await global.llmProvider.chat(messages);
        
        if (compressedContext && compressedContext.length > 200) {
          debug('Successfully compressed SIP context');
          
          // Save the compressed context
          await storage.saveCompressedContext(compressedContext);
          
          return compressedContext;
        } else {
          debug('Received too short or empty response from LLM');
          if (attempt === maxRetries) {
            throw new Error('Failed to get a valid compressed context after multiple attempts');
          }
        }
      } catch (error) {
        debug(`Error in compression attempt ${attempt}: ${error.message}`);
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
    
    return null;
  }
  
  // Extract a summary from HTML content
  extractSummary(htmlContent) {
    if (!htmlContent) return 'No content available';
    
    // Remove HTML tags
    const textContent = htmlContent.replace(/<[^>]*>/g, ' ');
    
    // Remove extra whitespace
    const cleanedText = textContent.replace(/\s+/g, ' ').trim();
    
    // Limit to first 200 characters
    return cleanedText.length > 200 
      ? cleanedText.substring(0, 200) + '...'
      : cleanedText;
  }
}

// CLI chat functionality
class ChatCLI {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.chatService = new ChatService();
  }
  
  // Promisify readline question
  askQuestion(query) {
    return new Promise((resolve) => this.rl.question(query, resolve));
  }
  
  // Start the CLI chat
  async startChat() {
    console.log('\nSIP Assistant: Hello! I can help you write SIP proposals. What would you like to discuss?\n');
    
    // Create a recursive function to keep the conversation going
    const promptUser = async () => {
      const input = await this.askQuestion('You: ');
      
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log('\nSIP Assistant: Goodbye! Have a great day!\n');
        this.rl.close();
        return;
      }
      
      try {
        const response = await axios.post('http://localhost:3000/api/chat', {
          message: input,
          sessionId: 'cli-session'
        });
        
        if (!response.data || !response.data.response) {
          throw new Error('Invalid response format from server');
        }
        
        // Extract and display the assistant's message
        const assistantMessage = response.data.response;
        console.log('\nSIP Assistant:', assistantMessage, '\n');
        
        // Ask if user wants to save the conversation
        const saveResponse = await this.askQuestion('Would you like to save this response? (y/n): ');
        if (saveResponse.toLowerCase() === 'y') {
          const result = await this.chatService.saveChatToFile('cli-session');
          console.log(result.message);
        }
        console.log(); // Add newline after save prompt
        
      } catch (error) {
        const errorMessage = error.response?.data?.error || 'Could not connect to the chatbot server. Make sure it\'s running on port 3000.';
        console.log('\nError:', errorMessage, '\n');
      }
      
      // Continue the conversation
      promptUser();
    };
    
    promptUser();
  }
}

module.exports = { ChatService, ChatCLI }; 