router.get("/", async (req, res) => {
  const { vendor_id, terminal_id } = req.query;

  const { data, error } = await supabase
    .from("delivery_boys")
    .select("*")
    .eq("vendor_id", vendor_id)
    .eq("terminal_id", terminal_id);

  res.json({ success: true, riders: data });
});
