describe('MakeFilmWizardDialog full style dataset (integration)', () => {
  // The camera and theme fields are now modal pickers opened from trigger
  // buttons. Each trigger has a distinct aria-label ("Camera angle: …" /
  // "Visual theme: …") and shows the current selection. Selecting an option
  // only commits when Apply is pressed.
  const cameraTrigger = () => screen.getByRole('button', { name: /^Camera angle:/i })
  const themeTrigger = () => screen.getByRole('button', { name: /^Visual theme:/i })

  // Open the camera picker, choose an option, and press Apply.
  function pickCamera(label: string) {
    fireEvent.click(cameraTrigger())
    fireEvent.click(screen.getByText(label))
    fireEvent.click(screen.getByText('Apply'))
  }

  // Open the theme picker, switch to the given tab, choose an option, Apply.
  function pickTheme(tab: string, label: string) {
    fireEvent.click(themeTrigger())
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab) }))
    fireEvent.click(screen.getByText(label))
    fireEvent.click(screen.getByText('Apply'))
  }

  it('shows all camera styles and all theme tabs in the pickers', async () => {
    renderWizard()

    // Camera picker lists every shared camera style.
    fireEvent.click(cameraTrigger())
    await waitFor(() => expect(screen.getByText('Whip Pan')).toBeInTheDocument())
    expect(screen.getByText('Orbit Shot')).toBeInTheDocument()
    expect(screen.getByText('FPV Drone')).toBeInTheDocument()
    expect(screen.getByText('Parallax Motion')).toBeInTheDocument()
    // Close the camera picker without applying.
    fireEvent.click(screen.getByText('Cancel'))

    // Theme picker shows the Genre / Scene / Video Templates tabs.
    fireEvent.click(themeTrigger())
    await waitFor(() => expect(screen.getByRole('tab', { name: /Genre/ })).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: /Scene/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Video Templates/ })).toBeInTheDocument()
    // A Construction & Civil Works scene is present under the Scene tab.
    fireEvent.click(screen.getByRole('tab', { name: /Scene/ }))
    await waitFor(() => expect(screen.getByText('Rebar & Reinforcement Site')).toBeInTheDocument())
  })

  it('propagates the selected camera and theme into the scenario and image prompts', async () => {
    renderWizard()

    // Select a camera style (Whip Pan) via the picker + Apply.
    pickCamera('Whip Pan')

    // Select a theme (a Construction & Civil Works scene) via the Scene tab.
    pickTheme('Scene', 'Rebar & Reinforcement Site')

    // Write the scenario.
    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(writeScenario).toHaveBeenCalled())

    // The scenario prompt must carry the camera + theme directives.
    const promptArg = writeScenario.mock.calls[0][0]
    expect(promptArg).toContain('Whip pan camera move')
    expect(promptArg).toContain('Rebar and reinforcement environment')
    // The options passed to writeScenario carry the camera/theme prompts.
    const options = writeScenario.mock.calls[0][1]
    expect(options.cameraStyle).toContain('Whip pan camera move')
    expect(options.theme).toContain('Rebar and reinforcement environment')

    // Generate preview images — the creative (camera + theme) must propagate.
    fireEvent.click(screen.getByText('Generate preview images'))
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())
    const creative = generateSceneImage.mock.calls[0][5]
    expect(creative.cameraStyle).toContain('Whip pan camera move')
    expect(creative.theme).toContain('Rebar and reinforcement environment')
  })

  it('preserves the selected styles across Regenerate and Approve', async () => {
    renderWizard()

    // Select camera (Orbit Shot) + theme (Heavy Industry Factory).
    pickCamera('Orbit Shot')
    pickTheme('Scene', 'Heavy Industry Factory')

    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(screen.getByText('Scene one')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Generate preview images'))
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())
    generateSceneImage.mockClear()

    // Regenerate scene 0 — the creative must be preserved.
    const regenButtons = screen.getAllByText('Regenerate')
    fireEvent.click(regenButtons[0])
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())
    const regenCreative = generateSceneImage.mock.calls[0][5]
    expect(regenCreative.cameraStyle).toContain('Orbit shot')
    expect(regenCreative.theme).toContain('Heavy industry factory')

    // Approve — the creative must be preserved in the approval payload.
    fireEvent.click(screen.getByText(/Approve & Make Film/i))
    await waitFor(() => expect(onApprove).toHaveBeenCalled())
    const approveCreative = onApprove.mock.calls[0][2].creative
    expect(approveCreative.cameraStyle).toContain('Orbit shot')
    expect(approveCreative.theme).toContain('Heavy industry factory')
  })

  it('does not change the committed value until Apply is pressed', async () => {
    renderWizard()

    // Open the camera picker, choose an option, but Cancel instead of Apply.
    fireEvent.click(cameraTrigger())
    await waitFor(() => expect(screen.getByText('Whip Pan')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Whip Pan'))
    fireEvent.click(screen.getByText('Cancel'))

    // The trigger still shows the previous (auto) selection.
    expect(screen.getByRole('button', { name: /^Camera angle: Auto \(AI decides\)/i })).toBeInTheDocument()

    // Write the scenario — no camera directive should be present.
    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(writeScenario).toHaveBeenCalled())
    const promptArg = writeScenario.mock.calls[0][0]
    expect(promptArg).not.toContain('Whip pan camera move')
  })
})
