# type-proof

## Measurement contract

```json
{
  "schema": "type-proof-contract-v1",
  "families": [
    {
      "id": "ui",
      "stack": [
        "Arial",
        "OMD Geometry Fixture",
        "sans-serif"
      ]
    }
  ],
  "roles": [
    {
      "id": "display",
      "familyId": "ui",
      "size": 32,
      "weights": [
        700
      ],
      "leading": 1.2,
      "minimumReadablePx": 12,
      "required": false
    },
    {
      "id": "section",
      "familyId": "ui",
      "size": 20,
      "weights": [
        700
      ],
      "leading": 1.35,
      "minimumReadablePx": 12,
      "required": false
    },
    {
      "id": "body",
      "familyId": "ui",
      "size": 15,
      "weights": [
        400
      ],
      "leading": 1.55,
      "minimumReadablePx": 12,
      "required": false
    },
    {
      "id": "control",
      "familyId": "ui",
      "size": 15,
      "weights": [
        700
      ],
      "leading": 1.55,
      "minimumReadablePx": 12,
      "required": false
    },
    {
      "id": "metadata",
      "familyId": "ui",
      "size": 12,
      "weights": [
        400
      ],
      "leading": 1.4,
      "minimumReadablePx": 12,
      "required": false
    }
  ],
  "assignments": [
    {
      "selector": "h1",
      "role": "display"
    },
    {
      "selector": "h2",
      "role": "section"
    },
    {
      "selector": "button,button span",
      "role": "control"
    },
    {
      "selector": "header,.metadata,.source,.status,.kicker",
      "role": "metadata"
    }
  ],
  "defaultTextRole": "body",
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
