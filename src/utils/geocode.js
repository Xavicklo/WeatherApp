const request = require("request");

const geocode = (address, callback) => {
  const url =
    "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
    encodeURIComponent(address) +
    ".json?access_token=pk.eyJ1IjoieGF2aWNrIiwiYSI6ImNsNW1hcXVsaTBwNXUzZHB4NWZydXRtbjYifQ.oDZwhgwvG44JYJpzFTcyRg&limit=1";

  request({ url, json: true }, (error, { body } = {}) => {
    if (error) {
      callback("Unable to connect to MapBox Api", undefined);
    } else if (!body.features[0]) {
      callback(
        "Unable to find location, please try another search.",
        undefined
      );
    } else {
      callback(undefined, {
        latitude: body.features[0].center[1],
        longitude: body.features[0].center[0],
        location: body.features[0].place_name,
      });
    }
  });
};

module.exports = geocode;
