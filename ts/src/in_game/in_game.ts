import { OWGames, OWGamesEvents, OWHotkeys } from "@overwolf/overwolf-api-ts";

// import OpenAi from 'openai';
import { AppWindow } from "../AppWindow";
import { kHotkeys, kWindowNames, kGamesFeatures } from "../consts";

import WindowState = overwolf.windows.WindowStateEx;

import axios from "axios";

// The window displayed in-game while a game is running.
// It listens to all info events and to the game events listed in the consts.ts file
// and writes them to the relevant log using <pre> tags.
// The window also sets up Ctrl+F as the minimize/restore hotkey.
// Like the background window, it also implements the Singleton design pattern.
class InGame extends AppWindow {
  private static _instance: InGame;
  private _gameEventsListener: OWGamesEvents;
  private _currentData: any;

  private _notification: HTMLElement;
  private _notifContainer: HTMLElement;
  private _suggestButton: HTMLElement;
  // private _openAI: OpenAi;

  infoLog;
  private constructor() {
    super(kWindowNames.inGame, false);

    this._notification = document.getElementById("notification");
    this._notifContainer = document.getElementById("notification-container");
    this._suggestButton = document.getElementById("suggest")


    this._suggestButton.addEventListener("click", () => {
      this.suggest()
    })

    this.setToggleHotkeyBehavior();
    this.setToggleHotkeyText();
  }

  public static instance() {
    if (!this._instance) {
      this._instance = new InGame();
    }

    return this._instance;
  }

  public async run() {
    const gameClassId = await this.getCurrentGameClassId();

    const gameFeatures = kGamesFeatures.get(gameClassId);

    if (gameFeatures && gameFeatures.length) {
      this._gameEventsListener = new OWGamesEvents(
        {
          onInfoUpdates: this.onInfoUpdates.bind(this),
          onNewEvents: this.onNewEvents.bind(this),
        },
        gameFeatures
      );
      overwolf.games.events.getInfo((res) => {
        // console.log(res)
      });

      this._gameEventsListener.start();
    }
  }

  private onInfoUpdates(info) {
    // this.logLine(this._infoLog, info, false);
    // console.log("info")
    // console.log(info.live_client_data.active_player)
  }

  private async playSuggestion(message) {
    const data = JSON.stringify({ message })
    const res = await axios.get("http://localhost:8000/tts?message="+message, {
      responseType: "blob",
    });

    // console.log(res.data)

    const audioUrl = URL.createObjectURL(res.data);

    // Create an Audio object and play the audio
    const audio = new Audio(audioUrl);
    audio.play();
  }

  // Special events will be highlighted in the event log
  private async onNewEvents(e) {
    const isKill = e.events.some((event) => event.name === "kill");
    if (isKill) {


      this.suggest()
    
      
    }
  }

  private suggest() {
    overwolf.games.events.getInfo(async (data: any) => {
      const stateData = this.getCurrentGameState(data)
      const req_data = JSON.stringify(stateData)
      console.log(req_data)
      const res = await axios.post("http://localhost:8000/suggestion", { headers: {"Content-Type": 'application/json'}, data: req_data })
      const message = res.data.message

      this.notif(message);
      this.playSuggestion(message)
    })



   

    // console.log(res)
  }

  private getCurrentGameState(data: any) {
    const active_player = JSON.parse(data.res.live_client_data.active_player);

    //get player data
    const playerGold = Math.floor(active_player.currentGold);

    let allPlayersData = JSON.parse(data.res.live_client_data.all_players);

    // get our team
    const player = allPlayersData.find((p) => p.riotId == active_player.riotId);
    const playerChampion = player.championName;
    const playerDead = player.isDead;
    const playerRespawnTimer = player.respawnTimer;
    const playerLevel = player.level;

    allPlayersData = allPlayersData.filter(
      (p) => p.riotId !== active_player.riotId
    );

    const playerTeam = player.team;

    allPlayersData = allPlayersData.map((p) => {
      return {
        champion: p.championName,
        dead: p.isDead,
        respawnTimer: p.respawnTimer,
        level: p.level,
        position: p.position,
        team: p.team,
      };
    });

    const allies = allPlayersData.filter((p) => p.team == playerTeam);

    const enemies = allPlayersData.filter((p) => p.team != playerTeam);

    //get jungle info

    // console.log(data.res);

    const jungle_camps = {
      riftAlive: false,
      dragonAlive: false,
      voidGrubsAlive: false,
      baronAlive: false,
    };

    Object.values(data.res.jungle_camps).forEach((camp: any) => {
      const campData = JSON.parse(camp); // Parse the JSON string into an object

      // Create a key based on the name, and set its value as an object with 'alive' and 'vision'
      switch (campData.name) {
        case "Rift Herald":
          jungle_camps.riftAlive = campData.alive;
          break;
        case "Dragon":
          jungle_camps.dragonAlive = campData.alive;
          break;
        case "VoidGrubs":
          jungle_camps.voidGrubsAlive = campData.alive;
          break;
        case "Baron":
          jungle_camps.baronAlive = campData.alive;
          break;
      }
    });

    return {
      playerChampion,
      playerGold,
      playerDead,
      playerRespawnTimer,
      playerLevel,
      allies,
      enemies,
      jungle_camps,
    };
  }

  // Displays the toggle minimize/restore hotkey in the window header
  private async setToggleHotkeyText() {
    const gameClassId = await this.getCurrentGameClassId();
    const hotkeyText = await OWHotkeys.getHotkeyText(
      kHotkeys.toggle,
      gameClassId
    );
    const hotkeyElem = document.getElementById("hotkey");
    hotkeyElem.textContent = hotkeyText;
  }

  // Sets toggleInGameWindow as the behavior for the Ctrl+F hotkey
  private async setToggleHotkeyBehavior() {
    const toggleInGameWindow = async (
      hotkeyResult: overwolf.settings.hotkeys.OnPressedEvent
    ): Promise<void> => {
      console.log(`pressed hotkey for ${hotkeyResult.name}`);
      const inGameState = await this.getWindowState();

      if (
        inGameState.window_state === WindowState.NORMAL ||
        inGameState.window_state === WindowState.MAXIMIZED
      ) {
        this.currWindow.minimize();
      } else if (
        inGameState.window_state === WindowState.MINIMIZED ||
        inGameState.window_state === WindowState.CLOSED
      ) {
        this.currWindow.restore();
      }
    };

    OWHotkeys.onHotkeyDown(kHotkeys.toggle, toggleInGameWindow);
  }

  private notif(message) {
    const notification = document.createElement("div");
    notification.classList.add("notification");

    // Set notification content
    notification.textContent = message;

    // Add notification to the container
    this._notifContainer.appendChild(notification);

    // If there are more than 3 notifications, remove the oldest one
    const notifications = document.querySelectorAll(".notification");

    if (notifications.length > 1) {
      const oldestNotification = notifications[0];
      this._notifContainer.removeChild(oldestNotification);
    }
    setTimeout(() => {
      this._notification.classList.remove("show");
    }, 3000);
  }

  private async getCurrentGameClassId(): Promise<number | null> {
    const info = await OWGames.getRunningGameInfo();

    return info && info.isRunning && info.classId ? info.classId : null;
  }
}

InGame.instance().run();
