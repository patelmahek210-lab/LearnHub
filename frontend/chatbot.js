async function sendMessage(){

const input = document.getElementById("userInput");
const chatbox = document.getElementById("chatbox");

const userText = input.value;

if(userText.trim() === "") return;

chatbox.innerHTML += "<p><b>You:</b> " + userText + "</p>";

const response = await fetch("/chatbot",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({message:userText})
});

const data = await response.json();

chatbox.innerHTML += "<p><b>AI:</b> " + data.reply + "</p>";

input.value="";
}