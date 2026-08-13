import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Box, Button, Snackbar, Alert, CircularProgress } from "@mui/material";

import SectionCard from "@/shared/components/SectionCard";
import Grid from "@mui/material/Grid";

// Import all our reusable Dumb Components
import { RootFolderSection } from "./RootFolderSection";
import { InstrumentMetadataSection } from "./InstrumentMetadataSection";
import { ProjectMetadataSection } from "./ProjectMetadataSection";
import { ProjectPeopleSection } from "./ProjectPeopleSection";
import { ImportSettingsSection } from "./ImportSettingsSection";
import { EcoTaxaLinkSection } from "./EcoTaxaLinkSection";
import { DataServerSection } from "./DataServerSection";

import { useProjectMetadataTab } from "@/features/projects/hooks/useProjectMetadataTab";

interface ProjectMetadataTabProps {
    // The ID of the project we are currently viewing
    projectId: number;
}

/**
 * ProjectMetadataTab Component
 * Displays and allows editing of a project's metadata.
 * Structure matches NewProjectPage exactly.
 */
export const ProjectMetadataTab: React.FC<ProjectMetadataTabProps> = ({ projectId }) => {
    // 1. Connect to the "Brain" (Hook)
    const {
        values,
        loading,
        saving,
        updateField,
        linkedEcoTaxaProject,
        ecoTaxaUnlinkWarning,
        handleUnlinkEcoTaxaProject,
        handleSave,
        handleCancel,
        isRemoteProject,
        lockedTitlePrefix,
        snackbar,
        closeSnackbar
    } = useProjectMetadataTab(projectId);

    const location = useLocation();
    const ecoTaxaLinkRef = useRef<HTMLDivElement>(null);

    // Scroll to the EcoTaxa link section when navigated here with the #ecotaxa-link anchor
    // (e.g. from the "LINK PROJECT" call-to-action on the Stats tab).
    useEffect(() => {
        if (!loading && location.hash === "#ecotaxa-link") {
            ecoTaxaLinkRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [loading, location.hash]);

    // Show a loading spinner while data is being fetched
    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                <CircularProgress />
            </Box>
        );
    }

    // 2. Render the assembled UI in the shared SectionCard (uniform card style
    // and width across all project tabs).
    return (
        <SectionCard>

                <RootFolderSection
                    value={values.rootFolderPath}
                    onChange={(val) => updateField('rootFolderPath', val)}
                    onLoadMetadata={() => { /* Not needed in edit mode */ }}
                />

                <InstrumentMetadataSection
                    values={values.instrument}
                    onChange={(data) => updateField('instrument', data)}
                />

                <ProjectMetadataSection
                    values={values.metadata}
                    onChange={(data) => updateField('metadata', data)}
                    lockedTitlePrefix={lockedTitlePrefix}
                />

                <ProjectPeopleSection
                    values={values.people}
                    onChange={(data) => updateField('people', data)}
                />


                <Grid container spacing={4}>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <ImportSettingsSection
                            values={values.importSettings}
                            onChange={(data) => updateField('importSettings', data)}
                        />
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }} id="ecotaxa-link" ref={ecoTaxaLinkRef}>
                        <EcoTaxaLinkSection
                            values={values.ecoTaxa}
                            onChange={(data) => updateField('ecoTaxa', data)}
                            projectTitle={values.metadata.title}
                            linkedProject={linkedEcoTaxaProject}
                            unlinkWarning={ecoTaxaUnlinkWarning ? "You will still need to click the save button to validate the changes. All samples in this project will be marked as not imported in EcoTaxa and their import history will be cleared." : null}
                            onUnlink={handleUnlinkEcoTaxaProject}
                            showCreateNewProjectToggle={!linkedEcoTaxaProject}
                            autoSelectLinkedAccount={false}
                        />
                    </Grid>
                </Grid>

                <DataServerSection
                    values={values.dataServer}
                    onChange={(data) => updateField('dataServer', data)}
                    isRemoteProject={isRemoteProject}
                />

                {/* Action Buttons (Save / Cancel) matching the bottom of the mockup */}
                <Box sx={{ mt: 6, pt: 3, display: 'flex', gap: 2 }}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleSave}
                        disabled={saving}
                        sx={{ minWidth: 120, fontWeight: 'bold' }}
                    >
                        {saving ? "SAVING..." : "SAVE"}
                    </Button>
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={handleCancel}
                        disabled={saving}
                        sx={{ minWidth: 120, fontWeight: 'bold' }}
                    >
                        CANCEL
                    </Button>
                </Box>

                {/* Shared Notification System */}
                <Snackbar
                    open={snackbar.open}
                    autoHideDuration={6000}
                    onClose={closeSnackbar}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                >
                    <Alert onClose={closeSnackbar} severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
                        {snackbar.message}
                    </Alert>
                </Snackbar>

        </SectionCard>
    );
};