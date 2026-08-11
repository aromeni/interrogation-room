export function renderBoot(app, state, ui, handlers) {
  app.innerHTML = `<section class="shell boot-shell">
    <article class="title-card">
      <div class="eyebrow">Case Division · Room 03</div>
      <hr class="rule">
      <h1>The Interrogation Room</h1>
      <p class="lede">Three suspects. One murderer. Their stories are all you have—until one of them cracks.</p>
      <button type="button" id="begin-case" class="primary-action">Begin Investigation</button>
    </article>
  </section>`;
  document.getElementById("begin-case").addEventListener("click", handlers.beginInvestigation);
}
