# PlanIT Backend API

[![CodeQL Advanced](https://github.com/Rongbin99/PlanIT-API/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/Rongbin99/PlanIT-API/actions/workflows/codeql.yml)
![GitHub last commit](https://img.shields.io/github/last-commit/Rongbin99/PlanIT-API)
![GitHub Release](https://img.shields.io/github/v/release/Rongbin99/PlanIT-API?style=flat)

This [express.js](https://expressjs.com/) backend server responds to API callbacks from the React Native frontend and provides endpoints for trip planning and chat history management.

> [!NOTE]
> **React Native Frontend**: The companion mobile app is available at [PlanIT Repository](https://github.com/Rongbin99/PlanIT). Refer to its README for setup instructions and API integration details.

## Instructions to Run

### Prerequisites

- Node.js (v16.0.0 or higher)
- npm or yarn package manager

### Setup

Clone this Git repository to your local machine.

```
git clone https://github.com/Rongbin99/PlanIT-API
```

Change directory to this project.

```
cd PlanIT-API
```

Install the node dependencies.

```
npm install
```

Clone the `env.example` file under /config and insert your API keys

```
OPENAI_API_KEY=
UNSPLASH_API_KEY=
```

Finally, run the server on your local machine.

```
npm run dev
```

## API Endpoints

### Base URL

```
http://localhost:3000
```

### Status Check

```http
GET /status
```

Returns server status and basic information.

### Root Endpoint

```http
GET /
```

Returns API information and available endpoints.

## Contact

For inquiries, feel free to reach out to me on Discord ([my Discord server link](discord.gg/3ExWbX2AXf)) or via email gu.rongbin99@gmail.com. *(serious inquiries only please)*

## Contributing

Contributions are welcome and encouraged! Please fork the repository and create a new pull request for review and approval by a Codeowner.
