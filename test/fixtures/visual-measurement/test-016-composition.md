# composition

## Measurement contract

```json
{
  "schema": "composition-measurement-contract-v1",
  "frequentAction": "button",
  "regions": [
    {
      "selector": ".task",
      "role": "task",
      "minimumVisible": 1
    },
    {
      "selector": "header",
      "role": "utility",
      "minimumVisible": 1
    }
  ],
  "colors": [
    {
      "role": "canvas",
      "selector": "body",
      "property": "background",
      "value": "#F7F8F6",
      "token": null
    },
    {
      "role": "action",
      "selector": "button",
      "property": "background",
      "value": "#176B5B",
      "token": null
    }
  ],
  "spacing": null,
  "relationships": [],
  "requiredViews": [
    {
      "id": "desktop-1280x900@1",
      "viewport": {
        "width": 1280,
        "height": 900
      },
      "browserZoom": 1
    },
    {
      "id": "mobile-390x844@1",
      "viewport": {
        "width": 390,
        "height": 844
      },
      "browserZoom": 1
    },
    {
      "id": "narrow-320x844@1",
      "viewport": {
        "width": 320,
        "height": 844
      },
      "browserZoom": 1
    }
  ]
}
```
