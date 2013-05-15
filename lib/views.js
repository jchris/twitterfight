// active players
function (doc, meta) {
  if (doc.name && doc.date)
  emit(doc.date, doc.name);
}

// user word cloud
function (doc, meta) {
  if (/^u:/.test(meta.id) && doc.count) {
      var parts = meta.id.split(':');
      emit([parts[1], doc.count], parts[2]);
  }
}
