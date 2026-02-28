async function poll(){

  const res =
    await fetch("/state");

  const data =
    await res.json();

  if(data.winner){
    showWinner(data);
  }

  setTimeout(poll,500);
}

poll();