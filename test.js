function hello_world() {
  alert("Hello world")
}

this.addEventListener('message', function(event) {
    document.write(event.data); // NOT OK
})
