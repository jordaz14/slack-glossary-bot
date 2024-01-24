// Configurations for Bolt, Dotenv, and PG-Promise
const { App } = require("@slack/bolt");
require("dotenv").config();
const pgp = require("pg-promise")();


// Establishes connection to database
const conn = {
  host: "dpg-cmm7es821fec73ckor1g-a",
  port: 5432,
  database: "lookerbot",
  user: "lookerbot_user",
  password: process.env.DB_CONNECT_KEY,
};

const db = pgp(conn);

// Initializes slack app with bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_KEY,
  signingSecret: process.env.SLACK_SECRET_KEY,
  appToken: process.env.SLACK_APP_KEY,
  customRoutes: [
    {
      path: 'https://slack-glossary-bot.onrender.com/slack/events',
      method: ['POST'],
      handler: (req, res) => {
        res.writeHead(200);
        res.end(`Things are going just fine at ${req.headers.host}!`);
      },
}]});

// SLACK APPLICATION CODE

// Command gb-help returns a welcoming message with a list of all available commands
app.command("/gb-help", async ({ command, ack, respond }) => {
  // Acknowledge command request
  await ack();

  // Sends block with help information back to user
  await respond({
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Welcome to GlossaryBot :wave:",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "To make your life easier, I'm a glossary for all of our company's metrics :tada:. Need my help? Simply type */gb* for GlossaryBot and see where that takes you! ",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Unfortunately I'm not a chatbot :robot_face:, so please see below for a complete list of available commands:",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "• */gb-help* - lists all available commands \n • */gb-list* - lists all words in glosssary \n • */gb-define [word]* - defines word in glossary \n • */gb-add* - add word to glossary \n • */gb-remove [word]* - remove word from glossary",
        },
      },
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "plain_text",
            text: "Developed by Julian Ordaz :face_with_cowboy_hat:",
            emoji: true,
          },
        ],
      },
    ],
  });
});

// Command gb-list returns with a list of all words in glossary
app.command("/gb-list", async ({ command, ack, respond }) => {
  // Acknowledge command request
  await ack();

  // Query for all words from glossary
  const res = await db.query("SELECT * FROM dictionary");

  // Convert DB return into array of words, sort alphabetically
  const resArray = res
    .map((item) => {
      return item.word;
    })
    .sort();

  // Initialize resStr for eventual text formatting back to user
  let resStr = "";

  // Format resStr with bullet points and line breaks
  resArray.forEach((el, index) => {
    resStr = resStr + `• ` + resArray[index] + `\n`;
  });

  await respond(`*Please see list below* :clipboard:\n${resStr}`);
});

// Command gb-define defines a word within the glossary
app.command("/gb-define", async ({ command, ack, respond }) => {
  // Acknowledge command request
  await ack();

  // Query for word the user inputted
  const res = await db.query("SELECT * FROM dictionary WHERE word = $1", [
    command.text.toUpperCase(),
  ]);

  // If word exists, return definition to user; otherwise, prompt user to add word to glossary
  try {
    await respond(`${command.text.toUpperCase()}: ${res[0].definition}`);
  } catch {
    await respond(
      `Sorry, but '${command.text.toUpperCase()}' does not exist :crying_cat_face:. Try */gb-add* to add your word to the glossary`
    );
  }
});

// Command gb-add prompts a modal for user to enter and define their word
app.command("/gb-add", async ({ command, ack, client, logger, body }) => {
  // Acknowledge command request
  await ack();

  try {
    // Call views.open with the built-in client (i.e. protocol for prompting modal to user)
    await client.views.open({
      // Pass a valid trigger_id within 3 seconds of receiving it
      trigger_id: body.trigger_id,
      // View payload
      view: {
        type: "modal",
        // View identifier
        callback_id: "view_1",
        title: {
          type: "plain_text",
          text: "GlossaryBot",
        },
        blocks: [
          {
            type: "input",
            // Block identifier to gather input
            block_id: "input_1",
            label: {
              type: "plain_text",
              text: "Enter word:",
            },
            element: {
              type: "plain_text_input",
              action_id: "word_input",
              multiline: false,
            },
          },
          {
            type: "input",
            // Block identifier to gather input
            block_id: "input_2",
            label: {
              type: "plain_text",
              text: "Enter definition:",
            },
            element: {
              type: "plain_text_input",
              action_id: "definition_input",
              multiline: true,
            },
          },
        ],
        submit: {
          type: "plain_text",
          text: "Submit",
        },
      },
    });
  } catch (error) {
    logger.error(error);
  }
});

// Handle a view_submission request
app.view("view_1", async ({ ack, body, view, client, logger }) => {
  // Acknowledge the view_submission request
  await ack();

  // Define user id for eventual user notification
  const user = body["user"]["id"];

  // Gather data from user submitted input text fields
  const wordEntry = view["state"]["values"]["input_1"];
  const defEntry = view["state"]["values"]["input_2"];

  // Query for word the user inputted
  const res = await db.query("SELECT * FROM dictionary WHERE word = $1", [
    wordEntry.word_input.value.toUpperCase(),
  ]);

  // If submitted word doesn't already exist...
  if (res[0] == undefined) {
    // Insert word into glossary
    await db.query(
      "INSERT INTO dictionary (word, definition) VALUES ($1, $2)",
      [
        wordEntry.word_input.value.toUpperCase(),
        defEntry.definition_input.value,
      ]
    );
    //Notify user that word was added to glossary
    await client.chat.postEphemeral({
      channel: user,
      user: user,
      text: `*${wordEntry.word_input.value.toUpperCase()}* was added to Glossary :partying_face:`,
    });
  } else {
    //Otherwise, notifiy user that word already exists
    await client.chat.postEphemeral({
      channel: user,
      user: user,
      text: `*${wordEntry.word_input.value.toUpperCase()}* already exists :shrug:. Try */gb-define* to see its definition`,
    });
  }
});

// Command gb-remove removes a word from the glossary
app.command("/gb-remove", async ({ command, ack, respond }) => {
  // Acknowledge command request
  await ack();

  // Query for word the user inputted
  const res = await db.query("SELECT * FROM dictionary WHERE word = $1", [
    command.text.toUpperCase(),
  ]);

  // If submitted word doesn't exist...
  if (res[0] == undefined) {
    // Notify user that there's no word to remove
    await respond(
      `Not to worry, *${command.text.toUpperCase()}* doesn't exist :relieved:.`
    );
  } else {
    // Otherwise, remove word from DB
    await db.query("DELETE FROM dictionary WHERE word =$1", [
      command.text.toUpperCase(),
    ]);
    // Notify user that word has been removed
    await respond(
      `*${command.text.toUpperCase()}* was removed from the glossary :no_good:`
    );
  }
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log("⚡️ Bolt app is running!");
})();
