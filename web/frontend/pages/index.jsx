import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  Text,
  VerticalStack,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

export default function HomePage() {
  const shopify = useAppBridge();
  const [announcementText, setAnnouncementText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!announcementText) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: announcementText }),
      });

      if (response.ok) {
        shopify.toast.show("Announcement saved and synced successfully!");
        setAnnouncementText("");
      } else {
        const errorData = await response.json();
        shopify.toast.show(`Error: ${errorData.error || "Failed to save"}`, { isError: true });
      }
    } catch (error) {
      shopify.toast.show("Network error occurred", { isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Page narrowWidth>
      <TitleBar title="FutureBlink Dashboard" />
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <VerticalStack gap="400">
              <Text as="h2" variant="headingMd">
                Set Announcement Banner
              </Text>
              <TextField
                label="Announcement Text"
                value={announcementText}
                onChange={setAnnouncementText}
                autoComplete="off"
                placeholder="e.g., Sale 50% Off!"
              />
              <Button primary onClick={handleSave} loading={isSaving} disabled={!announcementText}>
                Save
              </Button>
            </VerticalStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

