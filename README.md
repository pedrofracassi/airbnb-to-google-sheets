# AirBnB to Google Sheets

This repository contains the code for a Python FastAPI server with a single endpoint that takes an AirBnB listing URL and returns a JSON object with some details about the listing. There's also a Google Apps Script that creates custom functions in Google Sheets to interact with the FastAPI server.

Long story short, I took the task of planning a group trip with 18 friends a little too seriously.

> [!WARNING]
> This project is not affiliated with or endorsed by AirBnB. It's a personal project created for my own trip planning purposes, and I'm sharing it here in case it's useful for someone else.

---

### `GET /listing-details`

#### Example call

```bash
curl -X GET "https://airbnb-to-sheets.fly.dev/listing-details?url=https://www.airbnb.com.br/rooms/46276425&check_in=2025-03-01&check_out=2025-03-05&currency=BRL"
```

#### Query Parameters

- `url`: The URL of the AirBnB listing
- `check_in`: Check-in date in YYYY-MM-DD format
- `check_out`: Check-out date in YYYY-MM-DD format
- `currency`: Currency code (default: "USD")

#### Response

A JSON object containing:
- `name`: Title of the listing
- `total_price`: Total price for the stay (before taxes)
- `image_url`: URL of the listing's main image
- `beds`: Number of beds
- `baths`: Number of bathrooms
- `bedrooms`: Number of bedrooms
- `location_name`: Name of the location/neighborhood
- `latitude`: Geographical latitude of the property
- `longitude`: Geographical longitude of the property
- `guest_satisfaction`: Guest satisfaction rating
- `min_nights`: Minimum nights required for booking
- `max_nights`: Maximum nights allowed for booking

# How to use

1. Clone the repository, build the Docker image and run the container somewhere internet accessible.
2. Copy the `appscript.js` code to your Google Apps Script project
3. Declare the `BASE_URL` variable in the Google Apps Script project to point to your FastAPI server.
4. Use the `GETAIRBNBROW` function to get detail about a listing into a row in a Google Sheet.
5. Use the `GETTRAVELTIMECOORDS` function to get the travel time betwen where you'll be departing from and the listing's coordinates.