---
name: weather
description: Check current weather and forecasts
enabled: true
tools:
  - name: get_current_weather
    description: Get current weather for a location
    parameters:
      - name: location
        type: string
        required: true
        description: City name or coordinates
      - name: units
        type: string
        required: false
        description: Temperature units (celsius, fahrenheit)
  - name: get_forecast
    description: Get 5-day weather forecast
    parameters:
      - name: location
        type: string
        required: true
        description: City name or coordinates
---

# Weather Skill

This skill provides weather information using the OpenWeather API.

## Setup

Set your API key in environment:
```bash
export OPENWEATHER_API_KEY="your-api-key-here"
```

## Tool: get_current_weather

Fetches current weather conditions.

```bash
#!/bin/bash
location="${location}"
units="${units:-metric}"
api_key="${OPENWEATHER_API_KEY}"

curl -s "https://api.openweathermap.org/data/2.5/weather?q=${location}&units=${units}&appid=${api_key}"
```

## Tool: get_forecast

Fetches 5-day weather forecast.

```bash
#!/bin/bash
location="${location}"
api_key="${OPENWEATHER_API_KEY}"

curl -s "https://api.openweathermap.org/data/2.5/forecast?q=${location}&appid=${api_key}"
```

## Example Usage

Ask the agent:
- "What's the weather in London?"
- "Get me a 5-day forecast for Tokyo"
