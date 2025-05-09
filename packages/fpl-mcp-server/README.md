# Express TypeScript API

A blank Express server setup with TypeScript support.

## Project Structure

```
express-typescript-api/
├── src/                  # Source files
│   ├── config/           # Configuration files
│   ├── routes/           # API routes
│   └── server.ts         # Express application setup
├── dist/                 # Compiled JavaScript files
├── .gitignore            # Git ignore file
├── package.json          # Project metadata and dependencies
├── tsconfig.json         # TypeScript configuration
└── README.md             # Project documentation
```

## Prerequisites

-   Node.js (v14.x or higher recommended)
-   npm (v6.x or higher)

## Installation

1. Clone the repository:

    ```bash
    git clone <repository-url>
    cd express-typescript-api
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

## Development

To start the development server with hot-reloading:

```bash
npm run dev
```

This will start the server at http://localhost:3000

## Building for Production

To compile the TypeScript code to JavaScript:

```bash
npm run build
```

This will create the compiled JavaScript files in the `dist` directory.

## Running in Production

To run the compiled JavaScript in production:

```bash
npm start
```

## Available API Endpoints

-   `GET /`: Returns a welcome message
-   `GET /health`: Health check endpoint

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
NODE_ENV=development
PORT=3000
```

## Adding New Routes

1. Create a new route file in the `src/routes` directory
2. Import and use the route in `src/server.ts`

## License

ISC
