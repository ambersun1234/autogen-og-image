# autogen-og-image
autogen-og-image is a highly customizable [Open Graph](https://ogp.me/) image generator for your blog, specifically for [mmistakes/minimal-mistakes](https://github.com/mmistakes/minimal-mistakes)


## Description
![](./example.png)

This tool will generate the [Open Graph](https://ogp.me/) image based on the `frontmatter` section in your markdown article

What is a frontmatter?
```
---
title: Random Article Title
description: Random article description
---
```

<hr>

For this tool, the `frontmatter` will take the following attributes

|Required|`title`|`description`|`date`|
|:--:|:--:|:--:|:--:|
|Optional|`author`|`avatar`||

## GitHub Action
Create an action file `.github/workflows/ci.yaml` and fill in following content
```yaml
name: Build and Deploy to Github Pages

on:
  push:
    branches:
      - master # Here source code branch is `master`, it could be other branch

jobs:
  autogen_og_image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: mujo-code/puppeteer-headful@16.6.0
      # Install the corresponding font on system if needed
      - name: Install Chinese Font
        run: |
          sudo apt update
          sudo apt install -y fonts-noto
      - uses: ambersun1234/autogen-og-image@v1.0.0
        # Change author and avatar to your own(optionally)
        with:
          input_dir: ${{ github.workspace }}/_posts
          output_dir: ${{ github.workspace }}/assets/img/og
          author: "Shawn Hsu"
          avatar: "https://avatars.githubusercontent.com/u/13270428?v=4"
      - name: Commit og image and Push
        # Change the user.name and user.email to your own
        run: |
          git config --local user.name 'Shawn Hsu'
          git config --local user.email 'ambersun1234@users.noreply.github.com'
          if [ -z "$(git status --porcelain)" ]; then
            echo "Working directory clean. Nothing to commit."
            exit 0
          fi
          git add .
          git commit -m "Update og image"
          git push
```

For more customizable options(e.g. font size, font color), please refer to [action.yml](./action.yml)

## Environment Variable
This tool also support environment variable as input\
You can find various config in [.env.example](./.env.example)

Just copy to a new file `.env` and make some changes, you're good to go
```shell
$ cp .env.example .env
```

## Run
```shell
$ npm run build
$ node ./dist/main.js
```

## References
+ [A framework for building Open Graph images](https://github.blog/2021-06-22-framework-building-open-graph-images/)
+ [agneym/generate-og-image](https://github.com/agneym/generate-og-image)

## License
This project is licensed under GNU General Public License v3.0 License - see the [LICENSE](./LICENSE) file for detail
