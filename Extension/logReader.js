const PreWrap_consoleLogger = document.createElement("script");
PreWrap_consoleLogger.type = "text/javascript";
PreWrap_consoleLogger.id = "PreWrap_consoleLogger";
PreWrap_consoleLogger.innerText = `
  console.stdlog = console.log.bind(console);
  console.logs = [];
  console.log = function() {
    let inc = Array.from(arguments);
    inc.forEach(arg => {
      console.logs.push(arg);
    });
    while (console.logs.length > 100) {
      console.logs.shift();
    }
    console.stdlog.apply(console, arguments);
  };
`;
document.head.appendChild(PreWrap_consoleLogger);
