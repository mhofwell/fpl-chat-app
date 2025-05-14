#!/usr/bin/env ts-node
// scripts/test-claude-responses.ts

import { processUserMessage } from '../app/actions/chat';
import { config } from 'dotenv';
import * as readline from 'readline';

// Load environment variables
config();

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Sample test cases for the FPL assistant
const TEST_CASES = [
  "Who is the top scorer in the Premier League this season?",
  "Tell me about Manchester City's upcoming fixtures",
  "How is Erling Haaland performing in the last few gameweeks?",
  "Compare Mohamed Salah and Kevin De Bruyne",
  "Which defenders have the most clean sheets?",
  "What is the current gameweek?",
  "Who scored for Arsenal in their last match?",
  "Show me the top 5 midfielders by form",
  "When is the next double gameweek?",
  "Are there any good captaincy options for this week?"
];

// Display the test cases
function showTestCases() {
  console.log('\n=== Sample Test Cases ===');
  TEST_CASES.forEach((test, index) => {
    console.log(`${index + 1}. ${test}`);
  });
  console.log('0. Enter custom prompt');
  console.log('q. Quit');
}

// Test a single prompt
async function testPrompt(prompt: string) {
  console.log('\n=== Testing Prompt ===');
  console.log(`Prompt: "${prompt}"`);
  console.log('Processing...\n');

  try {
    const sessionId = null; // Start a new session
    const chatId = null; // Start a new chat

    const start = Date.now();
    const result = await processUserMessage(chatId, prompt, sessionId);
    const end = Date.now();

    console.log(`=== Response (${end - start}ms) ===`);
    console.log(result.answer);
    console.log('\n=== Tool Session ID ===');
    console.log(result.mcpSessionId || 'No session ID');
    console.log('\n=== Success ===');
    console.log(result.success ? 'Yes' : 'No');
    
    if (!result.success && result.error) {
      console.log('\n=== Error ===');
      console.log(result.error);
    }
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Main function to run the test script
async function main() {
  console.log('=== FPL Assistant Test Tool ===');
  console.log('This tool helps you test Claude\'s responses to FPL-related questions');

  let running = true;
  while (running) {
    showTestCases();
    
    const answer = await new Promise<string>(resolve => {
      rl.question('\nEnter test number, 0 for custom, or q to quit: ', resolve);
    });

    if (answer.toLowerCase() === 'q') {
      running = false;
      continue;
    }

    const num = parseInt(answer);
    if (isNaN(num)) {
      console.log('Invalid input. Please enter a number or q.');
      continue;
    }

    if (num === 0) {
      const customPrompt = await new Promise<string>(resolve => {
        rl.question('Enter your custom prompt: ', resolve);
      });
      await testPrompt(customPrompt);
    } else if (num > 0 && num <= TEST_CASES.length) {
      await testPrompt(TEST_CASES[num - 1]);
    } else {
      console.log(`Please select a number between 0 and ${TEST_CASES.length}`);
    }
  }

  console.log('Exiting test tool...');
  rl.close();
}

// Run the main function
main().catch(console.error);