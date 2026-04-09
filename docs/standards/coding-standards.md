# Coding Standards & Conventions:

## Purpose: To ensure all generated code is consistent, readable, and maintainable.

### Content Examples:

Variable/Function/Class Naming: (e.g., camelCase for variables/functions, PascalCase for classes/React components, UPPER_SNAKE_CASE for constants). You already have kebab-case for files.

TypeScript Strictness: "Enable and adhere to strict mode in tsconfig.json. Avoid any where possible; prefer specific types or unknown."

Modularity: "Prefer smaller, focused functions and components. Aim for single responsibility."

Comments: "Write JSDoc comments for public functions/methods and complex logic. Explain the 'why', not just the 'what'."

DRY (Don't Repeat Yourself): "Identify and abstract repeated logic into reusable utility functions or shared components."

Import Order: (If you have a preference, e.g., external libs, then internal absolute, then relative). Linters can often enforce this.

Use of Specific ESNext Features: "Prefer modern JavaScript features like optional chaining, nullish coalescing, async/await."

## Error Handling Philosophy & Patterns:

Purpose: To ensure robust error handling and a good user/developer experience.

### Content:

"All API endpoints and Server Actions must include comprehensive error handling using try/catch blocks."

"Log errors server-side with sufficient context (e.g., user ID if applicable, request ID, error stack)."

"For client-facing errors, return user-friendly messages. Avoid exposing raw error details or stack traces to the client."

"Define a consistent error response format for APIs (e.g., { success: false, error: { code: 'SOME_CODE', message: 'User-friendly message' } })."

"For LLM API calls, specifically handle rate limits, timeouts, and content filtering errors gracefully."

## Testing Strategy & Requirements:

Purpose: To guide the AI in generating testable code and potentially even basic test skeletons.

### Content:

"For core utility functions and complex business logic, generate unit tests using [Jest/Vitest]."

"For React components, generate basic rendering tests and interaction tests using React Testing Library."

"Server Actions and API Route Handlers should have integration tests covering success and error cases." (AI might help with structure).

"Aim for clear, descriptive test names."

"Mock external dependencies (like LLM APIs or database calls) in unit/integration tests."

## Security Best Practices & Considerations:

Purpose: To embed security thinking into the code generation process.

### Content:

"All user input must be validated on the server-side (in Server Actions, Route Handlers, or API endpoints) before processing or storing."

"Ensure proper authorization checks are performed in all Server Actions and API routes to verify the user has permission to perform the requested action or access the data."

"When interacting with Supabase, leverage Row-Level Security (RLS) policies. Server-side code should use service roles judiciously and primarily operate within user context where possible."

"Never store secrets (API keys, database credentials) in client-side code or commit them to the repository. Use Railway environment variables for all secrets."

"Be mindful of potential XSS vulnerabilities if rendering user-generated content (though React helps mitigate this)."

"Consider rate limiting for sensitive endpoints to prevent abuse (AI might help scaffold basic structure)."

## Accessibility (A11y) Guidelines (If not fully covered by shadcn/ui defaults):

Purpose: To ensure the application is usable by people with disabilities.

### Content:

"Ensure all interactive elements are keyboard accessible."

"Use semantic HTML elements appropriately."

"Provide alt text for all meaningful images (if any)."

"When generating forms, ensure labels are correctly associated with inputs."

"While shadcn/ui provides a good foundation, double-check ARIA attributes for custom components or complex interactions."

## API Design Conventions (If more detail needed beyond Tech Req):

Purpose: To ensure consistency and best practices for any RESTful or other APIs.

### Content:

"Adhere to RESTful principles for API design where applicable."

"Use standard HTTP methods correctly (GET, POST, PUT, DELETE)."

"Use consistent naming conventions for URL paths (e.g., kebab-case, plural nouns for collections)."

"Return appropriate HTTP status codes for responses (200, 201, 400, 401, 403, 404, 500)."