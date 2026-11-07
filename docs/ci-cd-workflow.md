
# FXAlert AI — CI/CD Workflow

## CI Workflow

This project uses GitHub Actions for automated testing.

```mermaid
flowchart TD
    A["Developer writes code"]
    B["Git Commit"]
    C["Git Push to GitHub"]
    D["GitHub Actions triggered"]
    E["Set up Python 3.12"]
    F["Install dependencies"]
    G["Run Pytest"]
    H{"Tests passed?"}
    I["CI Success"]
    J["Fix code and push again"]

    A --> B --> C --> D --> E --> F --> G --> H
    H -->|Yes| I
    H -->|No| J
    J --> B
```

## Current Implementation

- GitHub Actions runs automatically on Push and Pull Request.
- Python 3.12 is installed in the CI environment.
- Dependencies are installed from requirements.txt.
- Pytest checks exchange rate alert conditions.
- Test results are displayed in GitHub Actions.

## Future CD Plan

After CI tests pass, the project could be extended
with an automated deployment pipeline for AWS.

The current project implements CI only.
Automated cloud deployment (CD) has not been implemented.
