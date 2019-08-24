# Song Request Bot
Plays music using Spotify or YouTube, requested from Twitch chat.

**Important note**: The bot is not finished yet and will not work yet. 
## Getting Started
These instructions will show you how to install and use the bot.

### Prerequisites
+ [Node.js](https://nodejs.org)

### Installing
+ Go to the [releases-page](https://github.com/TrojanerHD/Minecraft-Music-Generator/releases), download the newest release as a `.zip`-file and unpack it in an empty folder.
+ Then you will have to manually install the node_modules:
  ```BAT
  cd "path/to/the/folder/where/you/unpacked/the/zip"
  npm install
  ```

You have to create two files inside the folder where you unpacked the zip.
+ `info.json`
    ```json
  {
      "twitch": {
        "username": "YOUR_TWITCH_USERNAME"
      },
      "commands": {
        "songrequest": [

        ]
      }
  }
    ```
    Note: The `songrequest` array is used to determine which commands will be recognized as song request commands. For example you could insert `"sr"` there.
+ `secrets.json`
  ```json
   {
     "spotify": {
       "id": "YOUR_ID",
       "secret": "YOUR_SECRET"
     },
     "twitch": {
       "password": "PASSWORD_OF_APPLICATION",
       "client-id": "CLIENT_ID_OF_APPLICATION"
     },
     "youtube": {
       "key": "YOUTUBE_KEY"
     }
   }
  ```
  For now, the bot needs some secrets. In the final version, those secrets will not be needed anymore but now they are necessary.
  1. [Create a Spotify application](https://developer.spotify.com/documentation/general/guides/app-settings/)
  2. Create a Twitch application:  
    Head to your [Twitch application dashboard](https://dev.twitch.tv/console/apps) and click on `Register Your Application`. The name can be whatever you want (I would recommend `songrequestbot`) and as OAuth Redirect URL enter the value you get from the [Twitch Chat Password Generator](https://twitchapps.com/tmi/). Afterward, select `Chat Bot` as category and click on create. Enter the OAuth Redirect URL in the json at `PASSWORD_OF_APPLICATION` and the Client ID as `CLIENT_ID_OF_APPLICATION`
  3. Create a YouTube application:  
     1. Create a new project with the YouTube Data API v3 in your [Google API Console](https://console.developers.google.com/flows/enableapi?apiid=youtube)
     2. On the Add credentials to your project page, click the Cancel button.
     3. At the top of the page, select the OAuth consent screen tab. Select an Email address, enter a Product name if not already set, and click the Save button.
     4. Select the Credentials tab, click the Create credentials button and select API key.
     5. Copy the API key and paste it into the json file at `YOUTUBE_KEY`
### Using
First, start Spotify either in a browser or the application. (optional)

Since the program is currently in alpha, you have to run the program via the command prompt.
+ Windows:
  ```BAT
  cd "path/to/the/folder/where/you/unpacked/the/zip"
  node_modules/electron/dist/electron.exe index.js
  ```
+ Unix (only tested on Linux but on macOS it should work the same way):
  ```SH
  cd "path/to/the/folder/where/you/unpacked/the/zip"
  node_modules/.bin/electron index.js
  ```
When you start the program for the first time, it will demand you in the command prompt window to head to a specific website and log in with your Spotify account. This is necessary to search for songs and play songs on Spotify  

Now you should see a window with a YouTube player which will play songs (Or at least will it do that once the bot development is finished).

## Built With
* [Node.js](https://nodejs.org) - Server side JavaScript
* [Electron](https://electronjs.org/) - The front-end (UI)
* [WebStorm](https://www.jetbrains.com/webstorm/) - IDE

## Contributing
Please read [CONTRIBUTING.md](https://gist.github.com/PurpleBooth/b24679402957c63ec426) for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning
We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/TrojanerHD/Minecraft-Music-Generator/tags). 

## Authors
* **Trojaner** - *Initial work* - [TrojanerHD](https://github.com/TrojanerHD)

See also the list of [contributors](https://github.com/TrojanerHD/Songrequestbot/contributors) who participated in this project.

## Additional Notes
In a future update it is planned that you can run the application without having to log in to Spotify. If you do not, links from Spotify will be not accepted and the bot will only use YouTube for search queries.